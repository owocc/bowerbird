import { Component } from "react";
import { default as AlertTriangle } from "~icons/ri/alert-line";
import { default as RefreshCw } from "~icons/ri/refresh-line";
import { default as EyeOff } from "~icons/ri/eye-close-line";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "@workspace/ui/components/button";
import { previewRegistry } from "../plugins/preview/registry";

export interface PluginErrorBoundaryProps {
  pluginId: string;
  pluginName?: string;
  children: ReactNode;
  fallback?: ReactNode;
  onDisable?: () => void;
}

interface PluginErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  override state: PluginErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `[PluginErrorBoundary] Plugin "${this.props.pluginId}" encountered an unhandled render error:`,
      error,
      errorInfo
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleDisable = () => {
    previewRegistry.setEnabled(this.props.pluginId, false);
    this.props.onDisable?.();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const name = this.props.pluginName || this.props.pluginId;

      return (
        <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md mx-auto my-auto rounded-2xl border border-destructive/30 bg-destructive/5 text-foreground">
          <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
            <AlertTriangle className="size-6" />
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-sm text-foreground">
              Plugin Render Failed
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">{name}</strong> crashed while
              rendering this item.
            </p>
            {this.state.error?.message && (
              <p className="mt-2 text-[11px] font-mono text-destructive/90 bg-destructive/10 rounded-md p-2 max-h-24 overflow-y-auto text-left break-words">
                {this.state.error.message}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleRetry}
              className="text-xs gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              <span>Retry</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={this.handleDisable}
              className="text-xs gap-1.5"
            >
              <EyeOff className="size-3.5" />
              <span>Disable Plugin</span>
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
