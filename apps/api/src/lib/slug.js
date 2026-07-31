export function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildProjectSlug(projectName, projectCode) {
  const nameSlug = slugify(projectName);
  const codeSlug = slugify(projectCode);
  return [nameSlug, codeSlug].filter(Boolean).join('-');
}
