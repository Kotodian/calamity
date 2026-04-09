import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export default function FlowEditorPage() {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
          Flow Editor
        </div>
      </ReactFlowProvider>
    </div>
  );
}
