import { installSessionRedirect } from "./api";
installSessionRedirect(window, (url) => location.assign(url));

import { installIdleSession } from "./idle";
installIdleSession(window, (url) => location.assign(url));
