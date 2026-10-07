import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="VibeProof">
      <s-section heading="Welcome to VibeProof">
        <s-paragraph>
          Turn customer reviews into content people actually want to browse.
        </s-paragraph>
      </s-section>

      <s-section heading="Development status">
        <s-badge tone="success">Connected</s-badge>
        <s-paragraph>
          Your VibeProof app is running successfully on the Shopify development store.
        </s-paragraph>
      </s-section>

      <s-section heading="Next up">
        <s-paragraph>
          We will build Reviews, Collect, Display, AI Studio, Analytics, and the storefront review widgets next.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
