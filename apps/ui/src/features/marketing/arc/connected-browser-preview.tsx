import { useI18n } from "../../../hooks/use-i18n.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import "../../../styles/marketing/arc/connected-browser-preview.css";

const B = "marketing.arc.connectedBrowser.";
const INVOICES = [
  { id: "INV-1042", amount: "$1,200", paid: true },
  { id: "INV-1043", amount: "$860", paid: false },
  { id: "INV-1047", amount: "$2,310", paid: false },
] as const;

/** Arc in your Chrome: tabs it opened sit in a Remote Arc group on a site you
 * allowed, your other tabs stay hidden from it, and sending waits for you.
 * Example data only. */
export function BrowserPreview() {
  const { tr } = useI18n();
  return (
    <div className="connectedBrowser">
      <div className="connectedBrowserTabs">
        <span className="connectedBrowserGroup">Remote Arc</span>
        <span className="connectedBrowserTab" data-active="">
          <i />
          {tr(`${B}invoicesTab`)}
        </span>
        <span className="connectedBrowserTab">
          <i />
          {tr(`${B}ordersTab`)}
        </span>
        <span className="connectedBrowserTab" data-hidden="">
          {tr(`${B}personalTab`)}
          <small>{tr(`${B}notVisible`)}</small>
        </span>
      </div>
      <div className="connectedBrowserAddress">
        <Icon name="shield" size={11} />
        <span>billing.example.com/invoices</span>
        <small>{tr(`${B}allowedSite`)}</small>
      </div>
      <div className="connectedBrowserPage">
        <table>
          <tbody>
            {INVOICES.map((invoice) => (
              <tr key={invoice.id} data-unpaid={invoice.paid ? undefined : ""}>
                <td>{invoice.id}</td>
                <td>{invoice.amount}</td>
                <td>
                  <span>{tr(invoice.paid ? `${B}paid` : `${B}unpaid`)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ol className="connectedBrowserSteps">
          <li data-done="">
            <Icon name="check" size={11} />
            {tr(`${B}stepRead`)}
          </li>
          <li data-done="">
            <Icon name="check" size={11} />
            {tr(`${B}stepFill`)}
          </li>
          <li data-waiting="">
            <Icon name="stop" size={11} />
            {tr(`${B}stepConfirm`)}
            <b>{tr(`${B}confirm`)}</b>
          </li>
        </ol>
      </div>
    </div>
  );
}
