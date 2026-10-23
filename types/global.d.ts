// path: types/global.d.ts
// React 19 removed the global JSX namespace. This keeps `JSX.Element` available as the return type of components.
import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
  }
}
