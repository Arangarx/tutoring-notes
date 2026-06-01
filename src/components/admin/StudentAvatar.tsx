import { cn } from "@/lib/utils";
import { studentAvatarHueClass, studentInitials } from "@/components/admin/student-initials";

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
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium tabular-nums",
        studentAvatarHueClass(name),
        sizeClasses[size],
        className
      )}
      aria-hidden
    >
      {studentInitials(name)}
    </span>
  );
}
