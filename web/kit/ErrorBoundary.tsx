import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import css from "./ErrorBoundary.module.css";
import { Button } from "./primitives/Button.tsx";

interface Props {
  /** Names the part of the page that failed, in the message and the console. */
  name: string;
  children?: ReactNode;
}

/** Shows a render error in place of its children, with Retry to remount them. */
interface BoundaryState {
  error: Error | null;
  /** Bumped by Retry; it keys the children so they mount fresh. */
  attempt: number;
}

export class ErrorBoundary extends Component<Props, BoundaryState> {
  state: BoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // oxlint-disable-next-line no-console -- a render error is a bug; the console is where its stack is readable
    console.error(`surface: ${this.props.name} failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    }
    return (
      <div className={css.error} role="alert">
        <b>The {this.props.name} view hit an error.</b>
        <pre>{this.state.error.message}</pre>
        <Button onClick={() => this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }))}>Retry</Button>
      </div>
    );
  }
}
