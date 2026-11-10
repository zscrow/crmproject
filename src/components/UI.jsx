import { paths } from "./icon-paths.mjs";
export function Icon({ name, className = "" }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill={name === "send" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.chat} />
    </svg>
  );
}
export function Avatar({ contact, small = false }) {
  const name = contact?.name || "Cliente";
  const initials =
    contact?.initials ||
    name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("");
  return (
    <span
      className={`avatar ${contact?.color || "blue"} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
export function Heading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Empty({
  title = "Tudo em dia por aqui",
  description,
  children,
}) {
  return (
    <div className="service-empty">
      <span>
        <Icon name="chat" />
      </span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
