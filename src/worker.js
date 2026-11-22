// The Worker's entry file. It exports only the handler: index.js also exports numbers and helpers for the tests, and
// `wrangler dev` refuses to start when an entry file exports anything that is not a handler.
export { default } from './index.js';
