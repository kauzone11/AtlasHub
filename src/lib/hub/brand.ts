export const HUB_BRAND = {
  productName: "Atlas Hub",
  shortProductName: "Hub",
  initials: "AH",
  webRoot: "/hub",
  apiRoot: "/api/hub",
  loginPath: "/hub/login",
  administrationPath: "/hub/ajustes",
} as const;

export type HubBrand = typeof HUB_BRAND;
