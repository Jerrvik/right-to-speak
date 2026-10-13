const PATHS = {
  grip: ["<circle cx='9' cy='5' r='1'/><circle cx='15' cy='5' r='1'/><circle cx='9' cy='12' r='1'/><circle cx='15' cy='12' r='1'/><circle cx='9' cy='19' r='1'/><circle cx='15' cy='19' r='1'/>"],
  hand: ["<path d='M7 12V7a1.5 1.5 0 0 1 3 0v3-5a1.5 1.5 0 0 1 3 0v5-4a1.5 1.5 0 0 1 3 0v4-2a1.5 1.5 0 0 1 3 0v4-2a1.5 1.5 0 0 1 3 0v6c0 4.5-2.7 7-7 7h-1c-1.5 0-2.3-.5-3.5-1.7L4 16.4a1.8 1.8 0 0 1 2.4-2.7L8 15'/>"],
  alert: ["<circle cx='12' cy='12' r='9'/><path d='M12 7v6m0 4v.2'/>"],
  users: ["<circle cx='9' cy='8' r='4'/><path d='M1.5 21v-2a7.5 7.5 0 0 1 15 0v2M16.5 4.5a4 4 0 0 1 0 7.2M19 21v-2a6 6 0 0 0-3.1-5.3'/>"],
  minus: ["<path d='M5 12h14'/>"],
  plus: ["<path d='M12 5v14M5 12h14'/>"],
  more: ["<circle cx='5' cy='12' r='1.5'/><circle cx='12' cy='12' r='1.5'/><circle cx='19' cy='12' r='1.5'/>"],
  mail: ["<rect x='3' y='5' width='18' height='14' rx='3'/><path d='m4 7 8 6 8-6'/>"],
  action: ["<path d='m13 2-9 12h8l-1 8 9-12h-8z'/>"],
  support: ["<path d='M3 8 7 5l5 2 5-2 4 3v9l-4 3-5-4-4 4-5-3zM7 5v8l5 3M17 5v8l-5 3M3 12l4 3m14-3-4 3'/>"],
  counteraction: ["<path d='m12 2 8 3v7c0 5-4 8-8 10-4-2-8-5-8-10V5z'/>"],
  clarification: ["<path d='M20 11a8 8 0 0 1-8 8 8.5 8.5 0 0 1-4-.9L4 20l1.3-4A8 8 0 1 1 20 11z'/>"],
  check: ["<path d='m4 12 5 5L20 6'/>"],
  eye: ["<path d='M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7'/><circle cx='12' cy='12' r='3'/>"],
  lock: ["<rect x='5' y='11' width='14' height='10' rx='2'/><path d='M8 11V7a4 4 0 0 1 8 0v4'/>"],
  clock: ["<circle cx='12' cy='12' r='9'/><path d='M12 7v5l4 2'/>"],
  close: ["<path d='M5 5l14 14M19 5 5 19'/>"],
  reset: ["<path d='M4 10a8 8 0 1 1 2 7M4 5v5h5'/>"],
};

export function icon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("rts-ico");
  if (className) svg.classList.add(...className.split(" "));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  // Only fixed SVG markup from this module is accepted here; user text uses textContent elsewhere.
  svg.innerHTML = PATHS[name]?.[0] ?? PATHS.alert[0];
  return svg;
}
