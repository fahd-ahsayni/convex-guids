import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";
import resend from "@convex-dev/resend/convex.config";
import pushNotifications from "@convex-dev/expo-push-notifications/convex.config";

const app = defineApp();
app.use(presence);
app.use(resend);
app.use(pushNotifications);


export default app;
