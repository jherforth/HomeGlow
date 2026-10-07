// The ambience building blocks: every module in layers/ that exports
// { name, Component }. Adding a block means adding a file there (and its
// options to schemas.js).
const modules = import.meta.glob('./layers/*.jsx', { eager: true, import: 'default' });

export const LAYERS = Object.fromEntries(Object.values(modules).map((layer) => [layer.name, layer.Component]));
