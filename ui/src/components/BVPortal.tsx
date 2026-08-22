import {FC} from "react";
import BVControl from "./control/BVControlComponent";
import { Dialog } from "../ui";

interface IBVPortalProps {
    open: boolean;
    onClose: () => void;
}

const BvPortal: FC<IBVPortalProps> = ({open, onClose}) => {
    return <Dialog open={open} onClose={onClose} title="BV Control Rack" description="Create reusable workflow states from ComfyUI groups." size="large"><BVControl /></Dialog>;
};

export default BvPortal;
