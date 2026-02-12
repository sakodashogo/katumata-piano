import { ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { MoveRight } from "lucide-react";

const buttonVariants = cva(
    "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
    {
        variants: {
            variant: {
                primary: "bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/20",
                secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
                outline: "border-2 border-slate-200 bg-transparent hover:bg-slate-50 text-slate-900",
                ghost: "bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900",
                link: "h-auto px-0 py-0 bg-transparent text-slate-600 underline-offset-4 hover:underline",
            },
            size: {
                sm: "h-9 px-4 text-sm",
                md: "h-11 px-6 text-base",
                lg: "h-14 px-8 text-lg",
                icon: "h-9 w-9 p-0",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "md",
        },
    }
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    icon?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, icon, children, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(buttonVariants({ variant, size }), className)}
                {...props}
            >
                {children}
                {icon && <MoveRight className="ml-2 h-4 w-4" />}
            </button>
        );
    }
);

Button.displayName = "Button";

export { Button, buttonVariants };
