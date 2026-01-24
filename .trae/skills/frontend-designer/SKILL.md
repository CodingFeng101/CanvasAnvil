---
name: "frontend-designer"
description: "Generates beautiful, modern UI designs using Tailwind CSS and React. Invoke when user asks to improve UI, style, layout, or visual appearance of the application."
---

# Frontend Designer

This skill focuses on creating high-quality, modern, and accessible user interfaces.

## Capabilities

- **Tailwind CSS Mastery**: Use advanced Tailwind utility classes for layout, typography, colors, and effects.
- **Component Design**: Create reusable, composable React components.
- **Responsive Design**: Ensure layouts work seamlessly across mobile, tablet, and desktop.
- **Accessibility**: Implement ARIA attributes and keyboard navigation.
- **Animation**: Use CSS transitions and animations for delightful micro-interactions.

## Guidelines

1. **Modern Aesthetic**: Prefer clean, minimal, and whitespace-generous designs (e.g., shadcn/ui style).
2. **Color Palette**: Use semantic color names (bg-background, text-foreground) for dark mode support.
3. **Typography**: Use clear, legible font stacks.
4. **Icons**: Use Lucide React icons for visual cues.
5. **Feedback**: Provide visual feedback for interactions (hover, focus, active states).

## Example: Creating a Card Component

```tsx
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}
```