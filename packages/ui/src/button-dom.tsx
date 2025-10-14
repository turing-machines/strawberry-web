import { ReactNode } from "react";
import { css, html } from "react-strict-dom";

const styles = css.create({
  button: {
    backgroundColor: {
      default: "#007bff",
      ":hover": "#0056b3",
      ":active": "#004085",
    },
    borderColor: "transparent",
    borderRadius: 6,
    borderWidth: 0,
    color: "white",
    cursor: "pointer",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 16,
    fontWeight: "600",
    paddingBlock: 12,
    paddingInline: 24,
    transitionDuration: "150ms",
    transitionProperty: "background-color",
  },
  buttonDisabled: {
    backgroundColor: {
      default: "#6c757d",
      ":hover": "#6c757d",
    },
    cursor: "not-allowed",
    opacity: 0.65,
  },
  buttonSecondary: {
    backgroundColor: {
      default: "#6c757d",
      ":hover": "#5a6268",
      ":active": "#545b62",
    },
  },
  buttonSuccess: {
    backgroundColor: {
      default: "#28a745",
      ":hover": "#218838",
      ":active": "#1e7e34",
    },
  },
  buttonDanger: {
    backgroundColor: {
      default: "#dc3545",
      ":hover": "#c82333",
      ":active": "#bd2130",
    },
  },
  buttonOutline: {
    backgroundColor: {
      default: "transparent",
      ":hover": "#007bff",
    },
    borderColor: {
      default: "#007bff",
      ":hover": "#007bff",
    },
    borderWidth: 2,
    color: {
      default: "#007bff",
      ":hover": "white",
    },
  },
  buttonSmall: {
    fontSize: 14,
    paddingBlock: 8,
    paddingInline: 16,
  },
  buttonLarge: {
    fontSize: 18,
    paddingBlock: 16,
    paddingInline: 32,
  },
});

interface ButtonDomProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "success" | "danger" | "outline";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}

export const ButtonDom = ({
  children,
  variant = "primary",
  size = "medium",
  disabled = false,
  onPress,
  testID,
}: ButtonDomProps) => {
  const buttonStyles = [
    styles.button,
    variant === "secondary" && styles.buttonSecondary,
    variant === "success" && styles.buttonSuccess,
    variant === "danger" && styles.buttonDanger,
    variant === "outline" && styles.buttonOutline,
    size === "small" && styles.buttonSmall,
    size === "large" && styles.buttonLarge,
    disabled && styles.buttonDisabled,
  ].filter(Boolean);

  return (
    <html.button
      style={buttonStyles}
      onClick={onPress}
      disabled={disabled}
      data-testid={testID}
    >
      {children}
    </html.button>
  );
};
