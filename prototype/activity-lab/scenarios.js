'use strict';

module.exports = Object.freeze([
  {
    id: 'response-only',
    name: 'Response-only turn',
    turns: 1,
    description: 'One model turn that answers briefly without using tools.',
    prompt: 'Reply with exactly: activity lab response complete. Do not use tools or web search.',
  },
  {
    id: 'filesystem-read',
    name: 'Read-only filesystem inspection',
    turns: 1,
    description: 'One model turn that reads a lab-created file and reports its marker.',
    fixture: { 'marker.txt': 'CHROMUX_ACTIVITY_LAB_MARKER\n' },
    prompt: 'Read marker.txt using a local read-only command and reply with only its marker. Do not use web search.',
  },
  {
    id: 'concurrent',
    name: 'Two concurrent turns',
    turns: 2,
    description: 'Two independent model turns start together in isolated temporary workspaces.',
    prompt: 'Briefly state that this isolated activity-lab turn completed. Do not use tools or web search.',
  },
  {
    id: 'cancellation',
    name: 'Cancellation during work',
    turns: 1,
    description: 'One model turn intended to be cancelled with the visible Cancel button.',
    prompt: 'Think carefully for a while about five ways to test a desktop activity indicator, then answer briefly. Do not use tools or web search.',
  },
  {
    id: 'idle-control',
    name: 'Idle / no-process control',
    turns: 0,
    description: 'Starts no process. The indicator must remain idle and never animate.',
    control: true,
  },
]);
