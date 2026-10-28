import "react";

// Components pass colors to their stylesheets through custom properties such as --c.
declare module "react" {
  interface CSSProperties {
    [property: `--${string}`]: string | number;
  }
}
