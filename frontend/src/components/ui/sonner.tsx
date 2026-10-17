import { useTheme } from "@/components/theme-provider"
import { Toaster as WorkspaceToaster } from "@workspace/ui/components/sonner"
import type { ComponentProps } from "react"

type ToasterProps = ComponentProps<typeof WorkspaceToaster>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <WorkspaceToaster
      theme={theme as ToasterProps["theme"]}
      {...props}
    />
  )
}

export { Toaster }
