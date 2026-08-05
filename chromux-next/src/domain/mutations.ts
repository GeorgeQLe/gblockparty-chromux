import {
  AlignmentDocumentV1Schema,
  AlignmentMutationBatchV1Schema,
  type AlignmentDocumentV1,
  type AlignmentMutationBatchV1,
  type AlignmentMutationOperation
} from "./schema";

export class MutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MutationConflictError";
  }
}

export interface AppliedMutation {
  document: AlignmentDocumentV1;
  inverseBatch: AlignmentMutationBatchV1;
}

function itemIndex(document: AlignmentDocumentV1, itemId: string): number {
  const index = document.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new MutationConflictError(`Item not found: ${itemId}`);
  return index;
}

function applyOperation(document: AlignmentDocumentV1, operation: AlignmentMutationOperation): AlignmentMutationOperation[] {
  switch (operation.type) {
    case "item.insert": {
      if (document.items.some((item) => item.id === operation.item.id)) {
        throw new MutationConflictError(`Duplicate item: ${operation.item.id}`);
      }
      if (operation.index > document.items.length) throw new MutationConflictError("Insert index is out of bounds");
      document.items.splice(operation.index, 0, structuredClone(operation.item));
      return [{ type: "item.remove", itemId: operation.item.id }];
    }
    case "item.update": {
      if (operation.item.id !== operation.itemId) throw new MutationConflictError("Updated item ID does not match target");
      const index = itemIndex(document, operation.itemId);
      const previous = structuredClone(document.items[index]!);
      document.items[index] = structuredClone(operation.item);
      return [{ type: "item.update", itemId: previous.id, item: previous }];
    }
    case "item.remove": {
      const index = itemIndex(document, operation.itemId);
      const previousViews = structuredClone(document.views);
      const [removed] = document.items.splice(index, 1);
      if (!removed) throw new MutationConflictError(`Item not found: ${operation.itemId}`);
      for (const view of document.views) {
        if (view.kind === "document") {
          for (const section of view.sections) section.itemIds = section.itemIds.filter((id) => id !== operation.itemId);
        } else if (view.kind === "deck") {
          for (const slide of view.slides) slide.itemIds = slide.itemIds.filter((id) => id !== operation.itemId);
        } else {
          view.nodes = view.nodes.filter((node) => node.itemId !== operation.itemId);
        }
      }
      return [
        { type: "item.insert", index, item: removed },
        ...previousViews.map((view) => ({ type: "view.set" as const, view }))
      ];
    }
    case "item.move": {
      const fromIndex = itemIndex(document, operation.itemId);
      if (operation.toIndex >= document.items.length) throw new MutationConflictError("Move index is out of bounds");
      const [item] = document.items.splice(fromIndex, 1);
      if (!item) throw new MutationConflictError(`Item not found: ${operation.itemId}`);
      document.items.splice(operation.toIndex, 0, item);
      return [{ type: "item.move", itemId: operation.itemId, toIndex: fromIndex }];
    }
    case "review.update": {
      const index = itemIndex(document, operation.itemId);
      const previous = structuredClone(document.items[index]!.review);
      document.items[index]!.review = structuredClone(operation.review);
      return [{ type: "review.update", itemId: operation.itemId, review: previous }];
    }
    case "view.set": {
      const index = document.views.findIndex((view) => view.kind === operation.view.kind);
      if (index < 0) {
        document.views.push(structuredClone(operation.view));
        return [{ type: "view.remove", kind: operation.view.kind }];
      }
      const previous = structuredClone(document.views[index]!);
      document.views[index] = structuredClone(operation.view);
      return [{ type: "view.set", view: previous }];
    }
    case "view.remove": {
      const index = document.views.findIndex((view) => view.kind === operation.kind);
      if (index < 0) throw new MutationConflictError(`View not found: ${operation.kind}`);
      const [removed] = document.views.splice(index, 1);
      if (!removed) throw new MutationConflictError(`View not found: ${operation.kind}`);
      return [{ type: "view.set", view: removed }];
    }
    case "status.set": {
      const previous = document.status;
      document.status = operation.status;
      return [{ type: "status.set", status: previous }];
    }
  }
}

export function applyMutationBatch(
  inputDocument: AlignmentDocumentV1,
  inputBatch: AlignmentMutationBatchV1,
  now = new Date().toISOString()
): AppliedMutation {
  const document = AlignmentDocumentV1Schema.parse(inputDocument);
  const batch = AlignmentMutationBatchV1Schema.parse(inputBatch);
  if (batch.documentId !== document.id) throw new MutationConflictError("Mutation targets a different document");
  if (batch.baseRevision !== document.revision) {
    throw new MutationConflictError(`Stale revision: expected ${document.revision}, received ${batch.baseRevision}`);
  }

  const next = structuredClone(document);
  const inverseOperations: AlignmentMutationOperation[] = [];
  for (const operation of batch.operations) {
    inverseOperations.unshift(...applyOperation(next, operation));
  }
  next.revision += 1;
  next.updatedAt = now;
  next.history.push({
    revision: next.revision,
    summary: batch.summary,
    appliedAt: now,
    actor: batch.actor
  });

  return {
    document: AlignmentDocumentV1Schema.parse(next),
    inverseBatch: AlignmentMutationBatchV1Schema.parse({
      schemaVersion: 1,
      documentId: next.id,
      baseRevision: next.revision,
      summary: `Undo: ${batch.summary}`,
      actor: batch.actor,
      operations: inverseOperations
    })
  };
}
