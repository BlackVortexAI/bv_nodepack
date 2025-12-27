import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { getApp } from "./appHelper.js";
import BVPortal from "./components/BVPortal";
const comfyApp = getApp();
import "./index.css";
import "./util/control/stateHandler";
import "./components/control/bv_control_center";

// Expose a setter so non-React callbacks (e.g., action bar button) can open the portal
let setPortalOpenExternal: ((open: boolean) => void) | null = null;

function BVRoot() {
    const [portalOpen, setPortalOpen] = useState(false);
    console.log("BVRoot rendered");
    console.log(comfyApp);

    useEffect(() => {
        setPortalOpenExternal = (open: boolean) => setPortalOpen(open);
        return () => {
            setPortalOpenExternal = null;
        };
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

// Set up once: create an action button that opens the persistent portal
comfyApp.registerExtension({
    name: "bv_nodepack.action_button",
    setup() {
        ensureMountedOnce();
    },
    actionBarButtons: [
        {
            icon: "pi pi-wrench",
            tooltip: "BV Tools",
            onClick: () => {
                ensureMountedOnce();
                setPortalOpenExternal?.(true);
            },
        },
    ],
});
