import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const defaultSettings = {
  collectRating: true,
  collectTitle: true,
  collectBody: true,
  collectEmail: true,
  collectPhoto: true,
  collectVideo: false,
  requireEmail: true,
  autoApproveFiveStar: false,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.collectionSettings.findUnique({
    where: { shop: session.shop },
  });

  return { settings: settings ?? defaultSettings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const data = {
    collectRating: formData.has("collectRating"),
    collectTitle: formData.has("collectTitle"),
    collectBody: formData.has("collectBody"),
    collectEmail: formData.has("collectEmail"),
    collectPhoto: formData.has("collectPhoto"),
    collectVideo: formData.has("collectVideo"),
    requireEmail: formData.has("requireEmail"),
    autoApproveFiveStar: formData.has("autoApproveFiveStar"),
  };

  await prisma.collectionSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { ok: true };
};

export default function CollectPage() {
  const { settings } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Collect">
      <s-section heading="Review submission form">
        <s-paragraph>
          Choose which fields customers can submit through the VibeProof storefront form.
        </s-paragraph>

        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-checkbox
              label="Star rating"
              name="collectRating"
              value="on"
              defaultChecked={settings.collectRating}
            ></s-checkbox>
            <s-checkbox
              label="Review title"
              name="collectTitle"
              value="on"
              defaultChecked={settings.collectTitle}
            ></s-checkbox>
            <s-checkbox
              label="Written review"
              name="collectBody"
              value="on"
              defaultChecked={settings.collectBody}
            ></s-checkbox>
            <s-checkbox
              label="Customer email"
              name="collectEmail"
              value="on"
              defaultChecked={settings.collectEmail}
            ></s-checkbox>
            <s-checkbox
              label="Photo reviews"
              name="collectPhoto"
              value="on"
              defaultChecked={settings.collectPhoto}
              details="The data model and display pipeline are ready. Direct customer file upload still needs a production media-storage provider."
            ></s-checkbox>
            <s-checkbox
              label="Video reviews"
              name="collectVideo"
              value="on"
              defaultChecked={settings.collectVideo}
              details="Video display is supported once media URLs exist. Direct customer video upload is not enabled until storage is connected."
            ></s-checkbox>
            <s-checkbox
              label="Require email"
              name="requireEmail"
              value="on"
              defaultChecked={settings.requireEmail}
            ></s-checkbox>
            <s-checkbox
              label="Auto-approve 5-star reviews"
              name="autoApproveFiveStar"
              value="on"
              defaultChecked={settings.autoApproveFiveStar}
              details="Off by default. Manual moderation is safer for most stores."
            ></s-checkbox>
            <s-button type="submit" variant="primary">Save collection settings</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Collection workflow">
        <s-paragraph>
          New storefront submissions enter VibeProof as genuine CUSTOMER reviews.
          Unless auto-approval is enabled for 5-star submissions, they remain pending
          until you approve or reject them from Reviews.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
