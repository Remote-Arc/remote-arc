import { useI18n } from "../../../hooks/use-i18n.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import "../../../styles/marketing/arc/connected-desktop-preview.css";

const D = "marketing.arc.connectedDesktop.";

/** The mouse pointer, drawn over the button the AI is about to press. */
function Pointer() {
  return (
    <svg
      className="connectedDesktopPointer"
      viewBox="0 0 16 22"
      width="14"
      height="19"
      aria-hidden="true"
    >
      <path d="M1 1v17l4.5-4.2 3 6.6 2.6-1.2-3-6.4H14L1 1Z" />
    </svg>
  );
}

/** Computer use: the notice across the top of the screen, a desktop app with
 * no API that the AI fills in, the pointer on Save and the steps so far.
 * Example data only. */
export function DesktopControlPreview() {
  const { tr } = useI18n();
  return (
    <div className="connectedDesktop">
      <div className="connectedDesktopNotice">
        <i />
        {tr(`${D}notice`)}
      </div>
      <div className="connectedDesktopWindow">
        <header>
          <span>{tr(`${D}appTitle`)}</span>
          <span aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </header>
        <div className="connectedDesktopForm">
          {(["supplier", "amount", "due"] as const).map((field) => (
            <label key={field}>
              <span>{tr(`${D}${field}Label`)}</span>
              <b>{tr(`${D}${field}Value`)}</b>
            </label>
          ))}
          <div className="connectedDesktopActions">
            <span>{tr(`${D}cancel`)}</span>
            <span data-target="">
              {tr(`${D}save`)}
              <Pointer />
            </span>
          </div>
        </div>
      </div>
      <ol className="connectedDesktopSteps">
        <li data-done="">
          <Icon name="check" size={11} />
          {tr(`${D}stepLook`)}
        </li>
        <li data-done="">
          <Icon name="check" size={11} />
          {tr(`${D}stepFill`)}
        </li>
        <li data-current="">
          <Icon name="device" size={11} />
          {tr(`${D}stepSave`)}
        </li>
      </ol>
      <p className="connectedDesktopTakeover">{tr(`${D}takeover`)}</p>
    </div>
  );
}
