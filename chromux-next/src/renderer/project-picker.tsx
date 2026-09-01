import React, { useEffect, useMemo, useState } from "react";
import { FolderPlus, Search } from "lucide-react";
import type { ProjectEntryV1 } from "../settings/workspace-preferences";
import {
  matchProjectDirectories,
  type ProjectDirectoryCandidateV1
} from "../settings/project-search";
import { Button } from "../ui/components";

interface PickerCandidate extends ProjectDirectoryCandidateV1 {
  registered: boolean;
}

export function ProjectPicker({ projects, value, onChange, chooseProject }: {
  projects: ProjectEntryV1[];
  value: string;
  onChange(projectPath: string): void;
  chooseProject(): void;
}) {
  const selectedProject = projects.find((project) => project.path === value);
  const [query, setQuery] = useState(selectedProject?.name ?? value.split(/[\\/]/).filter(Boolean).at(-1) ?? "");
  const [discovered, setDiscovered] = useState<ProjectDirectoryCandidateV1[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void window.chromuxNext.settings.searchProjects().then((result) => {
      if (cancelled) return;
      setDiscovered(result.candidates);
      setRoots(result.basePaths);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setSearchError("Directory scan unavailable; registered folders still work.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!value) return;
    const selected = projects.find((project) => project.path === value);
    setQuery(selected?.name ?? value.split(/[\\/]/).filter(Boolean).at(-1) ?? value);
  }, [projects, value]);

  const candidates = useMemo(() => {
    const registeredPaths = new Set(projects.map((project) => project.path));
    const combined = new Map<string, PickerCandidate>();
    for (const candidate of discovered) {
      combined.set(candidate.path, { ...candidate, registered: registeredPaths.has(candidate.path) });
    }
    for (const project of projects) {
      if (!combined.has(project.path)) {
        combined.set(project.path, {
          name: project.name,
          path: project.path,
          relativePath: project.path,
          basePath: "",
          nested: false,
          registered: true
        });
      }
    }
    return [...combined.values()].sort((left, right) => {
      if (left.registered !== right.registered) return left.registered ? -1 : 1;
      if (left.nested !== right.nested) return left.nested ? 1 : -1;
      return left.relativePath.localeCompare(right.relativePath);
    });
  }, [discovered, projects]);
  const matches = useMemo(() => matchProjectDirectories(candidates, query), [candidates, query]);
  const choose = (candidate: PickerCandidate) => {
    onChange(candidate.path);
    setQuery(candidate.name);
    setExpanded(false);
  };

  return <div className="project-picker">
    <div className="path-picker">
      <div className="project-combobox">
        <Search size={16} aria-hidden="true" />
        <input
          autoFocus
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls="project-search-results"
          aria-activedescendant={expanded && matches[activeIndex] ? `project-result-${activeIndex}` : undefined}
          placeholder="Search projects by name or path"
          value={query}
          onFocus={() => setExpanded(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange("");
            setActiveIndex(0);
            setExpanded(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setExpanded(true);
              setActiveIndex((index) => Math.min(index + 1, Math.max(0, matches.length - 1)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(0, index - 1));
            } else if ((event.key === "Tab" || event.key === "Enter") && expanded && matches[activeIndex]) {
              event.preventDefault();
              choose(matches[activeIndex]);
            } else if (event.key === "Escape") {
              setExpanded(false);
            }
          }}
        />
      </div>
      <Button type="button" icon={FolderPlus} onClick={chooseProject}>Add folder</Button>
    </div>
    {expanded && <div className="project-search-results" id="project-search-results" role="listbox">
      {loading && <p>Scanning project directories…</p>}
      {!loading && matches.map((candidate, index) => <button
        type="button"
        role="option"
        aria-selected={candidate.path === value}
        id={`project-result-${index}`}
        className={index === activeIndex ? "active" : ""}
        key={candidate.path}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(candidate)}
      >
        <span><strong>{candidate.name}</strong>{candidate.registered && <small>Registered</small>}{candidate.nested && <small>Nested</small>}</span>
        <small>{candidate.relativePath}</small>
      </button>)}
      {!loading && !matches.length && <p>No matching Git projects. Use Add folder for another directory.</p>}
    </div>}
    <small className="project-search-help">{value || searchError || (roots.length
      ? `Tab completes the highlighted match · scanning ${roots.join(", ")}`
      : "Tab completes the highlighted match")}</small>
  </div>;
}
