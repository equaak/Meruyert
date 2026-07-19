import { Sidebar, type NavGroup } from "@/components/sidebar";

/**
 * Sidebar nav — Kaspi Dashboard.
 * Заголовок раздела берётся из KASPI_MERCHANT_NAME, чтобы магазин видел своё имя.
 */
export async function SidebarServer() {
  // Snip enclosing quotes if user wrapped the env value in .env.local.
  const raw = process.env.KASPI_MERCHANT_NAME?.trim();
  const merchantName = raw && raw.length >= 2
    && ((raw[0] === '"' && raw[raw.length - 1] === '"') || (raw[0] === "'" && raw[raw.length - 1] === "'"))
    ? raw.slice(1, -1)
    : raw;
  const title = merchantName
    ? `Kaspi · ${merchantName}`
    : "Kaspi · Marketplace";

  const nav: NavGroup[] = [
    {
      id: "kaspi",
      title,
      defaultOpen: true,
      items: [
        { href: "/kaspi", label: "Обзор", iconName: "ShoppingCart" },
        { href: "/kaspi-zakazy", label: "Заказы", iconName: "List" },
        { href: "/kaspi-otmeny", label: "Отмены и возвраты", iconName: "XCircle" },
        { href: "/kaspi-dostavka", label: "Доставка", iconName: "Truck" },
        { href: "/kaspi-klienty", label: "Клиенты", iconName: "Users" },
        { href: "/kaspi-tovary", label: "Товары · ABC", iconName: "BarChart2" },
      ],
    },
    {
      id: "system",
      title: "Система",
      defaultOpen: false,
      items: [
        { href: "/settings", label: "Настройки", iconName: "Settings" },
      ],
    },
  ];

  return <Sidebar nav={nav} connectCta={false} />;
}
