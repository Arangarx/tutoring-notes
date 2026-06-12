import { cn } from "@/lib/utils";
import { studentAvatarColor, studentInitials } from "@/components/admin/student-initials";

type StudentAvatarProps = {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "size-9 text-xs",
  md: "size-11 text-sm",
  lg: "size-14 text-base",
} as const;

export function StudentAvatar({ name, size = "md", className }: StudentAvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white tabular-nums ring-2 ring-background",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: studentAvatarColor(name) }}
      aria-hidden
    >
      {studentInitials(name)}
    </span>
  );
}
