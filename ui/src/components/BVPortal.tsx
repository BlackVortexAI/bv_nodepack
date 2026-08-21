import {FC} from "react";
import BVControl from "./control/BVControlComponent";
import { BvDialog } from "../ui/react";

interface IBVPortalProps {
    open: boolean;
    onClose: () => void;
}

const BvPortal: FC<IBVPortalProps> = ({open, onClose}) => {
    return <BvDialog open={open} onClose={onClose} title="BV Control Rack" description="Create reusable workflow states from ComfyUI groups." size="large"><BVControl /></BvDialog>;
};

export default BvPortal;
