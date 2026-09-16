import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor} id={`${htmlFor}-label`}>
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Option = { value: string; label: string } | string;

export function SelectField({
  id,
  options,
  placeholder,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & {
  id: string;
  options: Option[];
  placeholder?: string;
}) {
  return (
    <NativeSelect id={id} name={id} className="w-full" {...props}>
      {placeholder !== undefined && <NativeSelectOption value="">{placeholder}</NativeSelectOption>}
      {options.map((o) => {
        const { value, label } = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <NativeSelectOption key={value} value={value}>
            {label}
          </NativeSelectOption>
        );
      })}
    </NativeSelect>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
