import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { getApp } from "./appHelper.js";
import BVPortal from "./components/BVPortal";
import styles from "./index.css?inline";
const comfyApp = getApp();
import "./components/control/bv_control_center";

const OPEN_CONTROL_RACK_EVENT = "bv-open-control-rack";
const STYLE_ID = "bv-nodepack-styles";

function BVRoot() {
    const [portalOpen, setPortalOpen] = useState(false);

    useEffect(() => {
        const open = () => setPortalOpen(true);
        window.addEventListener(OPEN_CONTROL_RACK_EVENT, open);
        return () => window.removeEventListener(OPEN_CONTROL_RACK_EVENT, open);
    }, []);

    return (
        <BVPortal
            open={portalOpen}
    onClose={() => setPortalOpen(false)}
>
    Hi
    </BVPortal>
);
}

const MOUNT_ID = "bv-root";

function ensureMountedOnce() {
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = styles;
        document.head.appendChild(style);
    }
    let container = document.getElementById(MOUNT_ID);
    if (!container) {
        container = document.createElement("div");
        container.id = MOUNT_ID;
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        root.render(
            <React.StrictMode>
                <BVRoot />
            </React.StrictMode>
        );
    }
}

comfyApp.registerExtension({
    name: "bv_nodepack.control_rack_portal",
    setup() {
        ensureMountedOnce();
    },
});
