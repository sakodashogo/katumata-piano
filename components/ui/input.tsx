import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, type = "text", label, error, ...props }, ref) => {
        return (
            <div className="w-full space-y-2">
                {label && (
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-700">
                        {label}
                    </label>
                )}
                <div className="relative">
                    <input
                        type={type}
                        className={cn(
                            "flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
                            error && "border-red-500 focus-visible:ring-red-500",
                            className
                        )}
                        ref={ref}
                        {...props}
                    />
                </div>
                {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
            </div>
        );
    }
);
Input.displayName = "Input";

export { Input };
