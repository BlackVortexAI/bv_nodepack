import { ComfyApiWorkflow } from '../platform/workflow/validation/schemas/workflowSchema';
import { ComfyWorkflowJSON } from '../platform/workflow/validation/schemas/workflowSchema';
import { ComfyWorkflowJSON as ComfyWorkflowJSON_2 } from '../../validation/schemas/workflowSchema';
import { Component } from 'vue';
import { DeviceStats } from '../schemas/apiSchema';
import { EmbeddingsResponse } from '../schemas/apiSchema';
import { ExecutedWsMessage } from '../schemas/apiSchema';
import { ExecutingWsMessage } from '../schemas/apiSchema';
import { ExecutionCachedWsMessage } from '../schemas/apiSchema';
import { ExecutionErrorWsMessage } from '../schemas/apiSchema';
import { ExecutionInterruptedWsMessage } from '../schemas/apiSchema';
import { ExecutionStartWsMessage } from '../schemas/apiSchema';
import { ExecutionSuccessWsMessage } from '../schemas/apiSchema';
import { ExtensionsResponse } from '../schemas/apiSchema';
import { FeatureFlagsWsMessage } from '../schemas/apiSchema';
import { HistoryTaskItem } from '../schemas/apiSchema';
import { LogEntry } from '../schemas/apiSchema';
import { LogsRawResponse } from '../schemas/apiSchema';
import { LogsWsMessage } from '../schemas/apiSchema';
import { NodeError } from '../schemas/apiSchema';
import { NodeId as NodeId_2 } from '../platform/workflow/validation/schemas/workflowSchema';
import { NotificationWsMessage } from '../schemas/apiSchema';
import { PendingTaskItem } from '../schemas/apiSchema';
import { PreviewMethod } from '../schemas/apiSchema';
import { ProgressStateWsMessage } from '../schemas/apiSchema';
import { ProgressTextWsMessage } from '../schemas/apiSchema';
import { ProgressWsMessage } from '../schemas/apiSchema';
import { PromptResponse } from '../schemas/apiSchema';
import { RunningTaskItem } from '../schemas/apiSchema';
import { Settings } from '../schemas/apiSchema';
import { Settings as Settings_2 } from '../../schemas/apiSchema';
import { Settings as Settings_3 } from '../../../schemas/apiSchema';
import { ShallowRef } from 'vue';
import { StatusWsMessage } from '../schemas/apiSchema';
import { StatusWsMessageStatus } from '../schemas/apiSchema';
import { SystemStats } from '../schemas/apiSchema';
import { TerminalSize } from '../schemas/apiSchema';
import { useDialogService } from '../services/dialogService';
import { User } from '../schemas/apiSchema';
import { UserData } from '../schemas/apiSchema';
import { UserDataFullInfo } from '../schemas/apiSchema';
import { z } from 'zod';

export declare interface AboutPageBadge {
    label: string;
    url: string;
    icon: string;
}

export declare interface ActionBarButton {
    /**
     * Icon class to display (e.g., "icon-[lucide--message-circle-question-mark]")
     */
    icon: string;
    /**
     * Optional label text to display next to the icon
     */
    label?: string;
    /**
     * Optional tooltip text to show on hover
     */
    tooltip?: string;
    /**
     * Optional CSS classes to apply to the button
     */
    class?: string;
    /**
     * Click handler for the button
     */
    onClick: () => void;
}

export declare type AnimationOptions = {
    /** Duration of the animation in milliseconds. */
    duration?: number;
    /** Relative target zoom level. 1 means the view is fit exactly on the bounding box. */
    zoom?: number;
    /** The animation easing function (curve) */
    easing?: EaseFunction;
};

/** Dictionary of all api calls */
export declare interface ApiCalls extends BackendApiCalls, FrontendApiCalls {
}

/** Dictionary of API events: `[name]: CustomEvent<Type>` */
export declare type ApiEvents = AsCustomEvents<ApiEventTypes>;

/** Dictionary of types used in the detail for a custom event */
export declare type ApiEventTypes = ApiToEventType<ApiCalls>;

/** Handles differing event and API signatures. */
export declare type ApiToEventType<T = ApiCalls> = {
    [K in keyof T]: K extends 'status' ? StatusWsMessageStatus : K extends 'executing' ? NodeId_2 : T[K];
};

/** Wraps all properties in {@link CustomEvent}. */
export declare type AsCustomEvents<T> = {
    readonly [K in keyof T]: CustomEvent<T[K]>;
};

export declare class AssetWidget extends BaseWidget<IAssetWidget> implements IAssetWidget {
    constructor(widget: IAssetWidget, node: LGraphNode);
    set value(value: IAssetWidget['value']);
    get value(): IAssetWidget['value'];
    get _displayValue(): string;
    drawWidget(ctx: CanvasRenderingContext2D, { width, showText }: DrawWidgetOptions): void;
    onClick(): void;
}

export declare interface AuthUserInfo {
    id: string;
}

/** Dictionary of calls originating from ComfyUI core */
export declare interface BackendApiCalls {
    progress: ProgressWsMessage;
    executing: ExecutingWsMessage;
    executed: ExecutedWsMessage;
    status: StatusWsMessage;
    notification: NotificationWsMessage;
    execution_start: ExecutionStartWsMessage;
    execution_success: ExecutionSuccessWsMessage;
    execution_error: ExecutionErrorWsMessage;
    execution_interrupted: ExecutionInterruptedWsMessage;
    execution_cached: ExecutionCachedWsMessage;
    logs: LogsWsMessage;
    /** Binary preview/progress data */
    b_preview: Blob;
    /** Binary preview with metadata (node_id, prompt_id) */
    b_preview_with_metadata: {
        blob: Blob;
        nodeId: string;
        parentNodeId: string;
        displayNodeId: string;
        realNodeId: string;
        promptId: string;
    };
    progress_text: ProgressTextWsMessage;
    progress_state: ProgressStateWsMessage;
    feature_flags: FeatureFlagsWsMessage;
}

export declare enum BadgePosition {
    TopLeft = "top-left",
    TopRight = "top-right"
}

export declare interface BaseBottomPanelExtension {
    id: string;
    title?: string;
    titleKey?: string;
    targetPanel?: 'terminal' | 'shortcuts';
}

export declare interface BaseDOMWidget<V extends object | string = object | string> extends IBaseWidget<V, string, DOMWidgetOptions<V>> {
    type: string;
    options: DOMWidgetOptions<V>;
    value: V;
    callback?: (value: V) => void;
    /** The unique ID of the widget. */
    readonly id: string;
    /** The node that the widget belongs to. */
    readonly node: LGraphNode;
    /** Whether the widget is visible. */
    isVisible(): boolean;
    /** The margin of the widget. */
    margin: number;
}

export declare interface BaseExportedGraph {
    /** Unique graph ID.  Automatically generated if not provided. */
    id: UUID;
    /** The revision number of this graph. Not automatically incremented; intended for use by a downstream save function. */
    revision: number;
    config?: LGraphConfig;
    /** Details of the appearance and location of subgraphs shown in this graph. Similar to */
    subgraphs?: ExportedSubgraphInstance[];
    /** Definitions of re-usable objects that are referenced elsewhere in this exported graph. */
    definitions?: {
        /** The base definition of subgraphs used in this workflow. That is, what you see when you open / edit a subgraph. */
        subgraphs?: ExportedSubgraph[];
    };
}

export declare interface BaseLGraph {
    /** The root graph. */
    readonly rootGraph: LGraph;
}

export declare interface BaseResolvedConnection {
    link: LLink;
    /** The node on the input side of the link (owns {@link input}) */
    inputNode?: LGraphNode;
    /** The input the link is connected to (mutually exclusive with {@link subgraphOutput}) */
    input?: INodeInputSlot;
    /** The node on the output side of the link (owns {@link output}) */
    outputNode?: LGraphNode;
    /** The output the link is connected to (mutually exclusive with {@link subgraphInput}) */
    output?: INodeOutputSlot;
    /** The subgraph output the link is connected to (mutually exclusive with {@link input}) */
    subgraphOutput?: SubgraphOutput;
    /** The subgraph input the link is connected to (mutually exclusive with {@link output}) */
    subgraphInput?: SubgraphInput;
}

export declare interface BaseSidebarTabExtension {
    id: string;
    title: string;
    icon?: string | Component;
    iconBadge?: string | (() => string | null);
    tooltip?: string;
    label?: string;
}

/**
 * Base class for widgets that have increment and decrement buttons.
 */
export declare abstract class BaseSteppedWidget<TWidget extends IBaseWidget = IBaseWidget> extends BaseWidget<TWidget> {
    /**
     * Whether the widget can increment its value
     * @returns `true` if the widget can increment its value, otherwise `false`
     */
    abstract canIncrement(): boolean;
    /**
     * Whether the widget can decrement its value
     * @returns `true` if the widget can decrement its value, otherwise `false`
     */
    abstract canDecrement(): boolean;
    /**
     * Increment the value of the widget
     * @param options The options for the widget event
     */
    abstract incrementValue(options: WidgetEventOptions): void;
    /**
     * Decrement the value of the widget
     * @param options The options for the widget event
     */
    abstract decrementValue(options: WidgetEventOptions): void;
    /**
     * Draw the arrow buttons for the widget
     * @param ctx The canvas rendering context
     * @param width The width of the widget
     */
    drawArrowButtons(ctx: CanvasRenderingContext2D, width: number): void;
    drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
}

export declare abstract class BaseWidget<TWidget extends IBaseWidget = IBaseWidget> implements IBaseWidget {
    [symbol: symbol]: boolean;
    #private;
    /** From node edge to widget edge */
    static margin: number;
    /** From widget edge to tip of arrow button */
    static arrowMargin: number;
    /** Arrow button width */
    static arrowWidth: number;
    /** Absolute minimum display width of widget values */
    static minValueWidth: number;
    /** Minimum gap between label and value */
    static labelValueGap: number;
    computedHeight?: number;
    serialize?: boolean;
    computeLayoutSize?(node: LGraphNode): {
        minHeight: number;
        maxHeight?: number;
        minWidth: number;
        maxWidth?: number;
    };
    /** The node that this widget belongs to. */
    get node(): LGraphNode;
    linkedWidgets?: IBaseWidget[];
    name: string;
    options: TWidget['options'];
    label?: string;
    type: TWidget['type'];
    y: number;
    last_y?: number;
    width?: number;
    disabled?: boolean;
    computedDisabled?: boolean;
    hidden?: boolean;
    advanced?: boolean;
    promoted?: boolean;
    tooltip?: string;
    element?: HTMLElement;
    callback?(value: any, canvas?: LGraphCanvas, node?: LGraphNode, pos?: Point, e?: CanvasPointerEvent): void;
    mouse?(event: CanvasPointerEvent, pointerOffset: Point, node: LGraphNode): boolean;
    computeSize?(width?: number): Size;
    onPointerDown?(pointer: CanvasPointer, node: LGraphNode, canvas: LGraphCanvas): boolean;
    get value(): TWidget['value'];
    set value(value: TWidget['value']);
    constructor(widget: TWidget & {
        node: LGraphNode;
    });
    constructor(widget: TWidget, node: LGraphNode);
    get outline_color(): string;
    get background_color(): string;
    get height(): number;
    get text_color(): string;
    get secondary_text_color(): string;
    get disabledTextColor(): string;
    get displayName(): string;
    get _displayValue(): string;
    get labelBaseline(): number;
    /**
     * Draws the widget
     * @param ctx The canvas context
     * @param options The options for drawing the widget
     * @remarks Not naming this `draw` as `draw` conflicts with the `draw` method in
     * custom widgets.
     */
    abstract drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
    /**
     * Draws the standard widget shape - elongated capsule. The path of the widget shape is not
     * cleared, and may be used for further drawing.
     * @param ctx The canvas context
     * @param options The options for drawing the widget
     * @remarks Leaves {@link ctx} dirty.
     */
    protected drawWidgetShape(ctx: CanvasRenderingContext2D, { width, showText }: DrawWidgetOptions): void;
    /**
     * A shared routine for drawing a label and value as text, truncated
     * if they exceed the available width.
     */
    protected drawTruncatingText({ ctx, width, leftPadding, rightPadding }: DrawTruncatingTextOptions): void;
    /**
     * Handles the click event for the widget
     * @param options The options for handling the click event
     */
    abstract onClick(options: WidgetEventOptions): void;
    /**
     * Handles the drag event for the widget
     * @param options The options for handling the drag event
     */
    onDrag?(options: WidgetEventOptions): void;
    /**
     * Sets the value of the widget
     * @param value The value to set
     * @param options The options for setting the value
     */
    setValue(value: TWidget['value'], { e, node, canvas }: WidgetEventOptions): void;
    /**
     * Clones the widget.
     * @param node The node that will own the cloned widget.
     * @returns A new widget with the same properties as the original
     * @remarks Subclasses with custom constructors must override this method.
     *
     * Correctly and safely typing this is currently not possible (practical?) in TypeScript 5.8.
     */
    createCopyForNode(node: LGraphNode): this;
}

export declare type BasicReadonlyNetwork = Pick<ReadonlyLinkNetwork, 'getNodeById' | 'links' | 'getLink' | 'inputNode' | 'outputNode'>;

export declare class BooleanWidget extends BaseWidget<IBooleanWidget> implements IBooleanWidget {
    type: "toggle";
    drawWidget(ctx: CanvasRenderingContext2D, { width, showText }: DrawWidgetOptions): void;
    drawLabel(ctx: CanvasRenderingContext2D, x: number): void;
    drawValue(ctx: CanvasRenderingContext2D, x: number): void;
    onClick(options: WidgetEventOptions): void;
}

export export declare type BottomPanelExtension = VueBottomPanelExtension | CustomBottomPanelExtension;

export declare class ButtonWidget extends BaseWidget<IButtonWidget> implements IButtonWidget {
    type: "button";
    clicked: boolean;
    constructor(widget: IButtonWidget, node: LGraphNode);
    /**
     * Draws the widget
     * @param ctx The canvas context
     * @param options The options for drawing the widget
     */
    drawWidget(ctx: CanvasRenderingContext2D, { width, showText }: DrawWidgetOptions): void;
    drawLabel(ctx: CanvasRenderingContext2D, x: number): void;
    onClick({ e, node, canvas }: WidgetEventOptions): void;
}

/**
 * Shorthand for {@link Parameters} of optional callbacks.
 * @example
 * ```ts
 * const { onClick } = CustomClass.prototype
 * CustomClass.prototype.onClick = function (...args: CallbackParams<typeof onClick>) {
 *   const r = onClick?.apply(this, args)
 *   // ...
 *   return r
 * }
 * ```
 */
export declare type CallbackParams<T extends ((...args: any) => any) | undefined> = Parameters<Exclude<T, undefined>>;

/**
 * Shorthand for {@link ReturnType} of optional callbacks.
 * @see {@link CallbackParams}
 */
export declare type CallbackReturn<T extends ((...args: any) => any) | undefined> = ReturnType<Exclude<T, undefined>>;

export declare type CanvasColour = string | CanvasGradient | CanvasPattern;

/** Bit flags used to indicate what the pointer is currently hovering over. */
export declare enum CanvasItem {
    /** No items / none */
    Nothing = 0,
    /** At least one node */
    Node = 1,
    /** At least one group */
    Group = 2,
    /** A reroute (not its path) */
    Reroute = 4,
    /** The path of a link */
    Link = 8,
    /** A reroute slot */
    RerouteSlot = 32,
    /** A subgraph input or output node */
    SubgraphIoNode = 64,
    /** A subgraph input or output slot */
    SubgraphIoSlot = 128
}

/** MouseEvent with canvasX/Y and deltaX/Y properties */
export declare interface CanvasMouseEvent extends MouseEvent, Readonly<CanvasPointerExtensions>, LegacyMouseEvent {
}

/**
 * Allows click and drag actions to be export declared ahead of time during a pointerdown event.
 *
 * By default, it retains the most recent event of each type until it is reset (on pointerup).
 * - {@link eDown}
 * - {@link eMove}
 * - {@link eUp}
 *
 * Depending on whether the user clicks or drags the pointer, only the appropriate callbacks are called:
 * - {@link onClick}
 * - {@link onDoubleClick}
 * - {@link onDragStart}
 * - {@link onDrag}
 * - {@link onDragEnd}
 * - {@link finally}
 * @see
 * - {@link LGraphCanvas.processMouseDown}
 * - {@link LGraphCanvas.processMouseMove}
 * - {@link LGraphCanvas.processMouseUp}
 */
export declare class CanvasPointer {
    #private;
    /** Maximum time in milliseconds to ignore click drift */
    static bufferTime: number;
    /** Maximum gap between pointerup and pointerdown events to be considered as a double click */
    static doubleClickTime: number;
    /** Maximum offset from click location */
    static get maxClickDrift(): number;
    static set maxClickDrift(value: number);
    /** Assume that "wheel" events with both deltaX and deltaY less than this value are trackpad gestures. */
    static trackpadThreshold: number;
    /**
     * The minimum time between "wheel" events to allow switching between trackpad
     * and mouse modes.
     *
     * This prevents trackpad "flick" panning from registering as regular mouse wheel.
     * After a flick gesture is complete, the automatic wheel events are sent with
     * reduced frequency, but much higher deltaX and deltaY values.
     */
    static trackpadMaxGap: number;
    /** The maximum time in milliseconds to buffer a high-res wheel event. */
    static maxHighResBufferTime: number;
    /** The element this PointerState should capture input against when dragging. */
    element: Element;
    /** Pointer ID used by drag capture. */
    pointerId?: number;
    /** Set to true when if the pointer moves far enough after a down event, before the corresponding up event is fired. */
    dragStarted: boolean;
    /** The {@link eUp} from the last successful click */
    eLastDown?: CanvasPointerEvent;
    /** Used downstream for touch event support. */
    isDouble: boolean;
    /** Used downstream for touch event support. */
    isDown: boolean;
    /** The resize handle currently being hovered or dragged */
    resizeDirection?: CompassCorners;
    /**
     * If `true`, {@link eDown}, {@link eMove}, and {@link eUp} will be set to
     * `undefined` when {@link reset} is called.
     *
     * Default: `true`
     */
    clearEventsOnReset: boolean;
    /** The last pointerdown event for the primary button */
    eDown?: CanvasPointerEvent;
    /** The last pointermove event for the primary button */
    eMove?: CanvasPointerEvent;
    /** The last pointerup event for the primary button */
    eUp?: CanvasPointerEvent;
    /** Currently detected input device type */
    detectedDevice: 'mouse' | 'trackpad';
    /** Timestamp of last wheel event for cooldown tracking */
    lastWheelEventTime: number;
    /** Flag to track if we've received the first wheel event */
    hasReceivedWheelEvent: boolean;
    /** Buffered Linux wheel event awaiting confirmation */
    bufferedLinuxEvent?: WheelEvent;
    /** Timestamp when Linux event was buffered */
    bufferedLinuxEventTime: number;
    /** Timer ID for Linux buffer clearing */
    linuxBufferTimeoutId?: ReturnType<typeof setTimeout>;
    /**
     * If set, as soon as the mouse moves outside the click drift threshold, this action is run once.
     * @param pointer [DEPRECATED] This parameter will be removed in a future release.
     * @param eMove The pointermove event of this ongoing drag action.
     *
     * It is possible for no `pointermove` events to occur, but still be far from
     * the original `pointerdown` event. In this case, {@link eMove} will be null, and
     * {@link onDragEnd} will be called immediately after {@link onDragStart}.
     */
    onDragStart?(pointer: this, eMove?: CanvasPointerEvent): unknown;
    /**
     * Called on pointermove whilst dragging.
     * @param eMove The pointermove event of this ongoing drag action
     */
    onDrag?(eMove: CanvasPointerEvent): unknown;
    /**
     * Called on pointerup after dragging (i.e. not called if clicked).
     * @param upEvent The pointerup or pointermove event that triggered this callback
     */
    onDragEnd?(upEvent: CanvasPointerEvent): unknown;
    /**
     * Callback that will be run once, the next time a pointerup event appears to be a normal click.
     * @param upEvent The pointerup or pointermove event that triggered this callback
     */
    onClick?(upEvent: CanvasPointerEvent): unknown;
    /**
     * Callback that will be run once, the next time a pointerup event appears to be a normal click.
     * @param upEvent The pointerup or pointermove event that triggered this callback
     */
    onDoubleClick?(upEvent: CanvasPointerEvent): unknown;
    /**
     * Run-once callback, called at the end of any click or drag, whether or not it was successful in any way.
     *
     * The setter of this callback will call the existing value before replacing it.
     * Therefore, simply setting this value twice will execute the first callback.
     */
    get finally(): (() => unknown) | undefined;
    set finally(value: (() => unknown) | undefined);
    constructor(element: Element);
    /**
     * Callback for `pointerdown` events.  To be used as the event handler (or called by it).
     * @param e The `pointerdown` event
     */
    down(e: CanvasPointerEvent): void;
    /**
     * Callback for `pointermove` events.  To be used as the event handler (or called by it).
     * @param e The `pointermove` event
     */
    move(e: CanvasPointerEvent): void;
    /**
     * Callback for `pointerup` events.  To be used as the event handler (or called by it).
     * @param e The `pointerup` event
     */
    up(e: CanvasPointerEvent): boolean;
    /**
     * Checks if the given wheel event is part of a trackpad gesture.
     * This method now uses the new device detection internally for improved accuracy.
     * @param e The wheel event to check
     * @returns `true` if the event is part of a trackpad gesture, otherwise `false`
     */
    isTrackpadGesture(e: WheelEvent): boolean;
    /**
     * Resets the state of this {@link CanvasPointer} instance.
     *
     * The {@link finally} callback is first executed, then all callbacks and intra-click
     * state is cleared.
     */
    reset(): void;
}

/** PointerEvent with canvasX/Y and deltaX/Y properties */
export declare interface CanvasPointerEvent extends PointerEvent, CanvasMouseEvent {
}

/** All properties added when converting a pointer event to a CanvasPointerEvent (via {@link LGraphCanvas.adjustMouseEvent}). */
export declare type CanvasPointerExtensions = ICanvasPosition & IDeltaPosition & IOffsetWorkaround;

export declare class ChangeTracker {
    /**
     * The workflow that this change tracker is tracking
     */
    workflow: ComfyWorkflow;
    /**
     * The initial state of the workflow
     */
    initialState: ComfyWorkflowJSON;
    static MAX_HISTORY: number;
    /**
     * The active state of the workflow.
     */
    activeState: ComfyWorkflowJSON;
    undoQueue: ComfyWorkflowJSON[];
    redoQueue: ComfyWorkflowJSON[];
    changeCount: number;
    /**
     * Whether the redo/undo restoring is in progress.
     */
    _restoringState: boolean;
    ds?: {
        scale: number;
        offset: [number, number];
    };
    nodeOutputs?: Record<string, any>;
    private subgraphState?;
    constructor(
    /**
     * The workflow that this change tracker is tracking
     */
    workflow: ComfyWorkflow,
    /**
     * The initial state of the workflow
     */
    initialState: ComfyWorkflowJSON);
    /**
     * Save the current state as the initial state.
     */
    reset(state?: ComfyWorkflowJSON): void;
    store(): void;
    restore(): void;
    updateModified(): void;
    checkState(): void;
    updateState(source: ComfyWorkflowJSON[], target: ComfyWorkflowJSON[]): Promise<void>;
    undo(): Promise<void>;
    redo(): Promise<void>;
    undoRedo(e: KeyboardEvent): Promise<true | undefined>;
    beforeChange(): void;
    afterChange(): void;
    static init(): void;
    static bindInput(activeEl: Element | null): boolean;
    static graphEqual(a: ComfyWorkflowJSON, b: ComfyWorkflowJSON): boolean;
    private static graphDiff;
}

/**
 * Widget for displaying charts and data visualizations
 * This is a widget that only has a Vue widgets implementation
 */
export declare class ChartWidget extends BaseWidget<IChartWidget> implements IChartWidget {
    type: "chart";
    drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
    onClick(_options: WidgetEventOptions): void;
}

export declare type ClassList = string | string[] | Record<string, boolean>;

/** Items copied from the canvas */
export declare interface ClipboardItems_2 {
    nodes?: ISerialisedNode[];
    groups?: ISerialisedGroup[];
    reroutes?: SerialisableReroute[];
    links?: SerialisableLLink[];
    subgraphs?: ExportedSubgraph[];
}

/**
 * The items created by a clipboard paste operation.
 * Includes maps of original copied IDs to newly created items.
 */
export declare interface ClipboardPasteResult {
    /** All successfully created items */
    created: Positionable[];
    /** Map: original node IDs to newly created nodes */
    nodes: Map<NodeId, LGraphNode>;
    /** Map: original link IDs to new link IDs */
    links: Map<LinkId, LLink>;
    /** Map: original reroute IDs to newly created reroutes */
    reroutes: Map<RerouteId, Reroute>;
    /** Map: original subgraph IDs to newly created subgraphs */
    subgraphs: Map<UUID, Subgraph>;
}

export declare type Clipspace = {
    widgets?: Pick<IBaseWidget, 'type' | 'name' | 'value'>[] | null;
    imgs?: HTMLImageElement[] | null;
    original_imgs?: HTMLImageElement[] | null;
    images?: any[] | null;
    selectedIndex: number;
    img_paste_mode: string;
    paintedIndex: number;
    combinedIndex: number;
};

/**
 * A color option to customize the color of {@link LGraphNode} or {@link LGraphGroup}.
 * @see {@link LGraphCanvas.node_colors}
 */
export declare interface ColorOption {
    color: string;
    bgcolor: string;
    groupcolor: string;
}

/**
 * Widget for displaying a color picker
 * This is a widget that only has a Vue widgets implementation
 */
export declare class ColorWidget extends BaseWidget<IColorWidget> implements IColorWidget {
    type: "color";
    drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
    onClick(_options: WidgetEventOptions): void;
}

export declare class ComboWidget extends BaseSteppedWidget<IStringComboWidget | IComboWidget> implements IComboWidget {
    type: "combo";
    get _displayValue(): string;
    private getValues;
    /**
     * Checks if the value is {@link Array.at at} the given index in the combo list.
     * @param increment `true` if checking the use of the increment button, `false` for decrement
     * @returns `true` if the value is at the given index, otherwise `false`.
     */
    private canUseButton;
    /**
     * Returns `true` if the current value is not the last value in the list.
     * Handles edge case where the value is both the first and last item in the list.
     */
    canIncrement(): boolean;
    canDecrement(): boolean;
    incrementValue(options: WidgetEventOptions): void;
    decrementValue(options: WidgetEventOptions): void;
    private tryChangeValue;
    onClick({ e, node, canvas }: WidgetEventOptions): void;
}

export declare type ComboWidgetValues = string[] | Record<string, string> | ((widget?: IComboWidget, node?: LGraphNode) => string[]);

/** EventTarget typing has no generic capability. */
export export declare interface ComfyApi extends EventTarget {
    addEventListener<TEvent extends keyof ApiEvents>(type: TEvent, callback: ((event: ApiEvents[TEvent]) => void) | null, options?: AddEventListenerOptions | boolean): void;
    removeEventListener<TEvent extends keyof ApiEvents>(type: TEvent, callback: ((event: ApiEvents[TEvent]) => void) | null, options?: EventListenerOptions | boolean): void;
}

export export declare class ComfyApi extends EventTarget {
    #private;
    api_host: string;
    api_base: string;
    /**
     * The client id from the initial session storage.
     */
    initialClientId: string | null;
    /**
     * The current client id from websocket status updates.
     */
    clientId?: string;
    /**
     * The current user id.
     */
    user: string;
    socket: WebSocket | null;
    /**
     * Cache Firebase auth store composable function.
     */
    private authStoreComposable?;
    reportedUnknownMessageTypes: Set<string>;
    /**
     * Get feature flags supported by this frontend client.
     * Returns a copy to prevent external modification.
     */
    getClientFeatureFlags(): Record<string, unknown>;
    /**
     * Feature flags received from the backend server.
     */
    serverFeatureFlags: Record<string, unknown>;
    /**
     * The auth token for the comfy org account if the user is logged in.
     * This is only used for {@link queuePrompt} now. It is not directly
     * passed as parameter to the function because some custom nodes are hijacking
     * {@link queuePrompt} improperly, which causes extra parameters to be lost
     * in the function call chain.
     *
     * Ref: https://cs.comfy.org/search?q=context:global+%22api.queuePrompt+%3D%22&patternType=keyword&sm=0
     *
     * TODO: Move this field to parameter of {@link queuePrompt} once all
     * custom nodes are patched.
     */
    authToken?: string;
    /**
     * The API key for the comfy org account if the user logged in via API key.
     */
    apiKey?: string;
    constructor();
    internalURL(route: string): string;
    apiURL(route: string): string;
    fileURL(route: string): string;
    /**
     * Gets the Firebase auth store instance using cached composable function.
     * Caches the composable function on first call, then reuses it.
     * Returns null for non-cloud distributions.
     * @returns The Firebase auth store instance, or null if not in cloud
     */
    private getAuthStore;
    /**
     * Waits for Firebase auth to be initialized before proceeding.
     * Includes 10-second timeout to prevent infinite hanging.
     */
    private waitForAuthInitialization;
    fetchApi(route: string, options?: RequestInit): Promise<Response>;
    /**
     * Dispatches a custom event.
     * Provides type safety for the contravariance issue with EventTarget (last checked TS 5.6).
     * @param type The type of event to emit
     * @param detail The detail property used for a custom event ({@link CustomEventInit.detail})
     */
    dispatchCustomEvent<T extends SimpleApiEvents>(type: T): boolean;
    dispatchCustomEvent<T extends ComplexApiEvents>(type: T, detail: ApiEventTypes[T] | null): boolean;
    /** @deprecated Use {@link dispatchCustomEvent}. */
    dispatchEvent(event: never): boolean;
    /**
     * Creates and connects a WebSocket for realtime updates
     * @param {boolean} isReconnect If the socket is connection is a reconnect attempt
     */
    private createSocket;
    /**
     * Initialises sockets and realtime updates
     */
    init(): void;
    /**
     * Gets a list of extension urls
     */
    getExtensions(): Promise<ExtensionsResponse>;
    /**
     * Gets the available workflow templates from custom nodes.
     * @returns A map of custom_node names and associated template workflow names.
     */
    getWorkflowTemplates(): Promise<{
        [customNodesName: string]: string[];
    }>;
    /**
     * Gets the index of core workflow templates.
     * @param locale Optional locale code (e.g., 'en', 'fr', 'zh') to load localized templates
     */
    getCoreWorkflowTemplates(locale?: string): Promise<WorkflowTemplates[]>;
    /**
     * Gets a list of embedding names
     */
    getEmbeddings(): Promise<EmbeddingsResponse>;
    /**
     * Loads node object definitions for the graph
     * @returns The node definitions
     */
    getNodeDefs(): Promise<Record<string, ComfyNodeDef>>;
    /**
     * Queues a prompt to be executed
     * @param {number} number The index at which to queue the prompt, passing -1 will insert the prompt at the front of the queue
     * @param {object} data The prompt data to queue
     * @param {QueuePromptOptions} options Optional execution options
     * @throws {PromptExecutionError} If the prompt fails to execute
     */
    queuePrompt(number: number, data: {
        output: ComfyApiWorkflow;
        workflow: ComfyWorkflowJSON;
    }, options?: QueuePromptOptions): Promise<PromptResponse>;
    /**
     * Gets a list of model folder keys (eg ['checkpoints', 'loras', ...])
     * @returns The list of model folder keys
     */
    getModelFolders(): Promise<ModelFolderInfo[]>;
    /**
     * Gets a list of models in the specified folder
     * @param {string} folder The folder to list models from, such as 'checkpoints'
     * @returns The list of model filenames within the specified folder
     */
    getModels(folder: string): Promise<ModelFile[]>;
    /**
     * Gets the metadata for a model
     * @param {string} folder The folder containing the model
     * @param {string} model The model to get metadata for
     * @returns The metadata for the model
     */
    viewMetadata(folder: string, model: string): Promise<any>;
    /**
     * Loads a list of items (queue or history)
     * @param {string} type The type of items to load, queue or history
     * @returns The items of the specified type grouped by their status
     */
    getItems(type: 'queue' | 'history'): Promise<{
        Running: RunningTaskItem[];
        Pending: PendingTaskItem[];
    } | {
        History: HistoryTaskItem[];
    }>;
    /**
     * Gets the current state of the queue
     * @returns The currently running and queued items
     */
    getQueue(): Promise<{
        Running: RunningTaskItem[];
        Pending: PendingTaskItem[];
    }>;
    /**
     * Gets the prompt execution history
     * @returns Prompt history including node outputs
     */
    getHistory(max_items?: number, options?: {
        offset?: number;
    }): Promise<{
        History: HistoryTaskItem[];
    }>;
    /**
     * Gets system & device stats
     * @returns System stats such as python version, OS, per device info
     */
    getSystemStats(): Promise<SystemStats>;
    /**
     * Deletes an item from the specified list
     * @param {string} type The type of item to delete, queue or history
     * @param {number} id The id of the item to delete
     */
    deleteItem(type: string, id: string): Promise<void>;
    /**
     * Clears the specified list
     * @param {string} type The type of list to clear, queue or history
     */
    clearItems(type: string): Promise<void>;
    /**
     * Interrupts the execution of the running prompt. If runningPromptId is provided,
     * it is included in the payload as a helpful hint to the backend.
     * @param {string | null} [runningPromptId] Optional Running Prompt ID to interrupt
     */
    interrupt(runningPromptId: string | null): Promise<void>;
    /**
     * Gets user configuration data and where data should be stored
     */
    getUserConfig(): Promise<User>;
    /**
     * Creates a new user
     * @param { string } username
     * @returns The fetch response
     */
    createUser(username: string): Promise<Response>;
    /**
     * Gets all setting values for the current user
     * @returns { Promise<string, unknown> } A dictionary of id -> value
     */
    getSettings(): Promise<Settings>;
    /**
     * Gets a setting for the current user
     * @param { string } id The id of the setting to fetch
     * @returns { Promise<unknown> } The setting value
     */
    getSetting(id: keyof Settings): Promise<Settings[keyof Settings]>;
    /**
     * Stores a dictionary of settings for the current user
     */
    storeSettings(settings: Settings): Promise<Response>;
    /**
     * Stores a setting for the current user
     */
    storeSetting(id: keyof Settings, value: Settings[keyof Settings]): Promise<Response>;
    /**
     * Gets a user data file for the current user
     */
    getUserData(file: string, options?: RequestInit): Promise<Response>;
    /**
     * Stores a user data file for the current user
     * @param { string } file The name of the userdata file to save
     * @param { unknown } data The data to save to the file
     * @param { RequestInit & { stringify?: boolean, throwOnError?: boolean } } [options]
     * @returns { Promise<Response> }
     */
    storeUserData(file: string, data: any, options?: RequestInit & {
        overwrite?: boolean;
        stringify?: boolean;
        throwOnError?: boolean;
        full_info?: boolean;
    }): Promise<Response>;
    /**
     * Deletes a user data file for the current user
     * @param { string } file The name of the userdata file to delete
     */
    deleteUserData(file: string): Promise<Response>;
    /**
     * Move a user data file for the current user
     * @param { string } source The userdata file to move
     * @param { string } dest The destination for the file
     */
    moveUserData(source: string, dest: string, options?: {
        overwrite: boolean;
    }): Promise<Response>;
    listUserDataFullInfo(dir: string): Promise<UserDataFullInfo[]>;
    getGlobalSubgraphData(id: string): Promise<string>;
    getGlobalSubgraphs(): Promise<Record<string, GlobalSubgraphData>>;
    getLogs(): Promise<string>;
    getRawLogs(): Promise<LogsRawResponse>;
    subscribeLogs(enabled: boolean): Promise<void>;
    getFolderPaths(): Promise<Record<string, string[]>>;
    freeMemory(options: {
        freeExecutionCache: boolean;
    }): Promise<void>;
    /**
     * Gets the custom nodes i18n data from the server.
     *
     * @returns The custom nodes i18n data
     */
    getCustomNodesI18n(): Promise<Record<string, any>>;
    /**
     * Checks if the server supports a specific feature.
     * @param featureName The name of the feature to check (supports dot notation for nested values)
     * @returns true if the feature is supported, false otherwise
     */
    serverSupportsFeature(featureName: string): boolean;
    /**
     * Gets a server feature flag value.
     * @param featureName The name of the feature to get (supports dot notation for nested values)
     * @param defaultValue The default value if the feature is not found
     * @returns The feature value or default
     */
    getServerFeature<T = unknown>(featureName: string, defaultValue?: T): T;
    /**
     * Gets all server feature flags.
     * @returns Copy of all server feature flags
     */
    getServerFeatures(): Record<string, unknown>;
}

export export declare class ComfyApp {
    /**
     * List of entries to queue
     */
    private queueItems;
    /**
     * If the queue is currently being processed
     */
    private processingQueue;
    /**
     * Content Clipboard
     * @type {serialized node object}
         */
     static clipspace: Clipspace | null;
     static clipspace_invalidate_handler: (() => void) | null;
     static open_maskeditor: (() => void) | null;
     static maskeditor_is_opended: (() => void) | null;
     static clipspace_return_node: null;
     vueAppReady: boolean;
     api: ComfyApi;
     ui: ComfyUI;
     extensionManager: ExtensionManager;
     _nodeOutputs: Record<string, any>;
     nodePreviewImages: Record<string, string[]>;
     private rootGraphInternal;
     /** @deprecated Use {@link rootGraph} instead */
     get graph(): unknown;
     get rootGraph(): LGraph;
     canvas: LGraphCanvas;
     dragOverNode: LGraphNode | null;
     readonly canvasElRef: ShallowRef<HTMLCanvasElement | undefined, HTMLCanvasElement | undefined>;
     get canvasEl(): HTMLCanvasElement;
     private configuringGraphLevel;
     get configuringGraph(): boolean;
     ctx: CanvasRenderingContext2D;
     bodyTop: HTMLElement;
     bodyLeft: HTMLElement;
     bodyRight: HTMLElement;
     bodyBottom: HTMLElement;
     canvasContainer: HTMLElement;
     menu: ComfyAppMenu;
     openClipspace: () => void;
     private positionConversion?;
     /**
      * The node errors from the previous execution.
      * @deprecated Use useExecutionStore().lastNodeErrors instead
      */
     get lastNodeErrors(): Record<NodeId_2, NodeError> | null;
     /**
      * The error from the previous execution.
      * @deprecated Use useExecutionStore().lastExecutionError instead
      */
     get lastExecutionError(): ExecutionErrorWsMessage | null;
     /**
      * @deprecated Use useExecutionStore().executingNodeId instead
      * TODO: Update to support multiple executing nodes. This getter returns only the first executing node.
      * Consider updating consumers to handle multiple nodes or use executingNodeIds array.
      */
     get runningNodeId(): NodeId_2 | null;
     /**
      * @deprecated Use useWorkspaceStore().shiftDown instead
      */
     get shiftDown(): boolean;
     /**
      * @deprecated Use useWidgetStore().widgets instead
      */
     get widgets(): Record<string, ComfyWidgetConstructor>;
     /**
      * @deprecated storageLocation is always 'server' since
      * https://github.com/comfyanonymous/ComfyUI/commit/53c8a99e6c00b5e20425100f6680cd9ea2652218
      */
     get storageLocation(): string;
     /**
      * @deprecated storage migration is no longer needed.
      */
     get isNewUserSession(): boolean;
     /**
      * @deprecated Use useExtensionStore().extensions instead
      */
     get extensions(): ComfyExtension[];
     /**
      * The progress on the current executing node, if the node reports any.
      * @deprecated Use useExecutionStore().executingNodeProgress instead
      */
     get progress(): {
         node: string | number;
         max: number;
         value: number;
         prompt_id: string;
     } | null;
     /**
      * @deprecated Use {@link isImageNode} from @/utils/litegraphUtil instead
      */
     static isImageNode(node: LGraphNode): node is LGraphNode & {
         imgs: HTMLImageElement[] | undefined;
     };
     /**
      * Resets the canvas view to the default
      * @deprecated Use {@link useLitegraphService().resetView} instead
      */
     resetView(): void;
     constructor();
     get nodeOutputs(): Record<string, any>;
     set nodeOutputs(value: Record<string, any>);
     /**
      * If the user has specified a preferred format to receive preview images in,
      * this function will return that format as a url query param.
      * If the node's outputs are not images, this param should not be used, as it will
      * force the server to load the output file as an image.
      */
     getPreviewFormatParam(): string;
     getRandParam(): string;
     static onClipspaceEditorSave(): void;
     static onClipspaceEditorClosed(): void;
     static copyToClipspace(node: LGraphNode): void;
     static pasteFromClipspace(node: LGraphNode): void;
     /**
      * Adds a handler allowing drag+drop of files onto the window to load workflows
      */
     private addDropHandler;
     /**
      * Handle keypress
      */
     private addProcessKeyHandler;
     /**
      * Handles updates from the API socket
      */
     private addApiUpdateHandlers;
     /** Flag that the graph is configuring to prevent nodes from running checks while its still loading */
     private addConfigureHandler;
     private addAfterConfigureHandler;
     /**
      * Set up the app on the page
      */
     setup(canvasEl: HTMLCanvasElement): Promise<void>;
     private resizeCanvas;
     private updateVueAppNodeDefs;
     getNodeDefs(): Promise<Record<string, ComfyNodeDef>>;
     /**
      * Registers nodes with the graph
      */
     registerNodes(): Promise<void>;
     registerNodeDef(nodeId: string, nodeDef: ComfyNodeDef): Promise<void>;
     registerNodesFromDefs(defs: Record<string, ComfyNodeDef>): Promise<void>;
     loadTemplateData(templateData: any): void;
     private showMissingNodesError;
     private showMissingModelsError;
     loadGraphData(graphData?: ComfyWorkflowJSON, clean?: boolean, restore_view?: boolean, workflow?: string | null | ComfyWorkflow, options?: {
         showMissingNodesDialog?: boolean;
         showMissingModelsDialog?: boolean;
         checkForRerouteMigration?: boolean;
         openSource?: WorkflowOpenSource;
     }): Promise<void>;
     graphToPrompt(graph?: LGraph): Promise<{
         workflow: ComfyWorkflowJSON;
         output: ComfyApiWorkflow;
     }>;
     queuePrompt(number: number, batchCount?: number, queueNodeIds?: NodeExecutionId[]): Promise<boolean>;
     showErrorOnFileLoad(file: File): void;
     /**
      * Loads workflow data from the specified file
      * @param {File} file
      */
     handleFile(file: File, openSource?: WorkflowOpenSource): Promise<void>;
     isApiJson(data: unknown): data is ComfyApiWorkflow;
     loadApiJson(apiData: ComfyApiWorkflow, fileName: string): void;
     /**
      * Registers a Comfy web extension with the app
      * @param {ComfyExtension} extension
      */
     registerExtension(extension: ComfyExtension): void;
     /**
      * Collects context menu items from all extensions for canvas menus
      * @param canvas The canvas instance
      * @returns Array of context menu items from all extensions
      */
     collectCanvasMenuItems(canvas: LGraphCanvas): IContextMenuValue[];
     /**
      * Collects context menu items from all extensions for node menus
      * @param node The node being right-clicked
      * @returns Array of context menu items from all extensions
      */
     collectNodeMenuItems(node: LGraphNode): IContextMenuValue[];
     /**
      * Refresh combo list on whole nodes
      */
     refreshComboInNodes(): Promise<void>;
     /**
      * Clean current state
      */
     clean(): void;
     clientPosToCanvasPos(pos: Vector2): Vector2;
     canvasPosToClientPos(pos: Vector2): Vector2;
    }

    export declare class ComfyAppMenu {
        app: ComfyApp;
        actionsGroup: ComfyButtonGroup;
        settingsGroup: ComfyButtonGroup;
        viewGroup: ComfyButtonGroup;
        element: HTMLElement;
        constructor(app: ComfyApp);
    }

    export declare class ComfyButton implements ComfyComponent<HTMLElement> {
        #private;
        isOver: boolean;
        iconElement: HTMLElement;
        contentElement: HTMLSpanElement;
        popup: ComfyPopup;
        element: HTMLElement;
        overIcon: string;
        iconSize: number;
        content: string | HTMLElement;
        icon: string;
        tooltip: string;
        classList: ClassList;
        hidden: boolean;
        enabled: boolean;
        action: (e: Event, btn: ComfyButton) => void;
        constructor({ icon, overIcon, iconSize, content, tooltip, action, classList, visibilitySetting, app, enabled }: ComfyButtonProps);
        updateIcon: () => string;
        updateClasses: () => void;
        withPopup(popup: ComfyPopup, mode?: 'click' | 'hover'): this;
    }

    export declare class ComfyButtonGroup {
        element: HTMLElement;
        buttons: (HTMLElement | ComfyButton)[];
        constructor(...buttons: (HTMLElement | ComfyButton)[]);
        insert(button: ComfyButton, index: number): void;
        append(button: ComfyButton): void;
        remove(indexOrButton: ComfyButton | number): (HTMLElement | ComfyButton)[] | undefined;
        update(): void;
    }

    export declare type ComfyButtonProps = {
        icon?: string;
        overIcon?: string;
        iconSize?: number;
        content?: string | HTMLElement;
        tooltip?: string;
        enabled?: boolean;
        action?: (e: Event, btn: ComfyButton) => void;
        classList?: ClassList;
        visibilitySetting?: {
            id: keyof Settings_3;
            showValue: boolean;
        };
        app?: ComfyApp;
    };

    export declare interface ComfyCommand {
        id: string;
        function: (metadata?: Record<string, unknown>) => void | Promise<void>;
        label?: string | (() => string);
        icon?: string | (() => string);
        tooltip?: string | (() => string);
        menubarLabel?: string | (() => string);
        versionAdded?: string;
        confirmation?: string;
        source?: string;
        active?: () => boolean;
        category?: 'essentials' | 'view-controls';
    }

    export declare interface ComfyComponent<T extends HTMLElement = HTMLElement> {
        element: T;
    }

    export declare class ComfyDialog<T extends HTMLElement = HTMLElement> extends EventTarget {
        #private;
        element: T;
        textElement: HTMLElement;
        constructor(type?: string, buttons?: null);
        createButtons(): HTMLButtonElement[];
        close(): void;
        show(html: any): void;
    }

    export export declare interface ComfyExtension {
        /**
         * The name of the extension
         */
        name: string;
        /**
         * The commands defined by the extension
         */
        commands?: ComfyCommand[];
        /**
         * The keybindings defined by the extension
         */
        keybindings?: Keybinding[];
        /**
         * Menu commands to add to the menu bar
         */
        menuCommands?: MenuCommandGroup[];
        /**
         * Settings to add to the settings menu
         */
        settings?: SettingParams[];
        /**
         * Bottom panel tabs to add to the bottom panel
         */
        bottomPanelTabs?: BottomPanelExtension[];
        /**
         * Badges to add to the about page
         */
        aboutPageBadges?: AboutPageBadge[];
        /**
         * Badges to add to the top bar
         */
        topbarBadges?: TopbarBadge[];
        /**
         * Buttons to add to the action bar
         */
        actionBarButtons?: ActionBarButton[];
        /**
         * Allows any initialisation, e.g. loading resources. Called after the canvas is created but before nodes are added
         * @param app The ComfyUI app instance
         */
        init?(app: ComfyApp): Promise<void> | void;
        /**
         * Allows any additional setup, called after the application is fully set up and running
         * @param app The ComfyUI app instance
         */
        setup?(app: ComfyApp): Promise<void> | void;
        /**
         * Called before nodes are registered with the graph
         * @param defs The collection of node definitions, add custom ones or edit existing ones
         * @param app The ComfyUI app instance
         */
        addCustomNodeDefs?(defs: Record<string, ComfyNodeDef>, app: ComfyApp): Promise<void> | void;
        /**
         * Allows the extension to add custom widgets
         * @param app The ComfyUI app instance
         * @returns An array of {[widget name]: widget data}
         */
        getCustomWidgets?(app: ComfyApp): Promise<Widgets> | Widgets;
        /**
         * Allows the extension to add additional commands to the selection toolbox
         * @param selectedItem The selected item on the canvas
         * @returns An array of command ids to add to the selection toolbox
         */
        getSelectionToolboxCommands?(selectedItem: Positionable): string[];
        /**
         * Allows the extension to add context menu items to canvas right-click menus
         * @param canvas The canvas instance
         * @returns An array of context menu items to add (null values represent separators)
         */
        getCanvasMenuItems?(canvas: LGraphCanvas): (IContextMenuValue | null)[];
        /**
         * Allows the extension to add context menu items to node right-click menus
         * @param node The node being right-clicked
         * @returns An array of context menu items to add (null values represent separators)
         */
        getNodeMenuItems?(node: LGraphNode): (IContextMenuValue | null)[];
        /**
         * Allows the extension to add additional handling to the node before it is registered with **LGraph**
         * @param nodeType The node class (not an instance)
         * @param nodeData The original node object info config object
         * @param app The ComfyUI app instance
         */
        beforeRegisterNodeDef?(nodeType: typeof LGraphNode, nodeData: ComfyNodeDef, app: ComfyApp): Promise<void> | void;
        /**
         * Allows the extension to modify the node definitions before they are used in the Vue app
         * Modifications is expected to be made in place.
         *
         * @param defs The node definitions
         * @param app The ComfyUI app instance
         */
        beforeRegisterVueAppNodeDefs?(defs: ComfyNodeDef[], app: ComfyApp): void;
        /**
         * Allows the extension to register additional nodes with LGraph after standard nodes are added.
         * Custom node classes should extend **LGraphNode**.
         *
         * @param app The ComfyUI app instance
         */
        registerCustomNodes?(app: ComfyApp): Promise<void> | void;
        /**
         * Allows the extension to modify a node that has been reloaded onto the graph.
         * If you break something in the backend and want to patch workflows in the frontend
         * This is the place to do this
         * @param node The node that has been loaded
         * @param app The ComfyUI app instance
         */
        loadedGraphNode?(node: LGraphNode, app: ComfyApp): void;
        /**
         * Allows the extension to run code after the constructor of the node
         * @param node The node that has been created
         * @param app The ComfyUI app instance
         */
        nodeCreated?(node: LGraphNode, app: ComfyApp): void;
        /**
         * Allows the extension to modify the graph data before it is configured.
         * @param graphData The graph data
         * @param missingNodeTypes The missing node types
         */
        beforeConfigureGraph?(graphData: ComfyWorkflowJSON, missingNodeTypes: MissingNodeType[]): Promise<void> | void;
        /**
         * Allows the extension to run code after the graph is configured.
         * @param missingNodeTypes The missing node types
         */
        afterConfigureGraph?(missingNodeTypes: MissingNodeType[]): Promise<void> | void;
        /**
         * Fired whenever authentication resolves, providing the anonymized user id..
         * Extensions can register at any time and will receive the latest value immediately.
         * This is an experimental API and may be changed or removed in the future.
         */
        onAuthUserResolved?(user: AuthUserInfo, app: ComfyApp): Promise<void> | void;
        /**
         * Fired whenever the auth token is refreshed.
         * This is an experimental API and may be changed or removed in the future.
         */
        onAuthTokenRefreshed?(): Promise<void> | void;
        /**
         * Fired when user logs out.
         * This is an experimental API and may be changed or removed in the future.
         */
        onAuthUserLogout?(): Promise<void> | void;
        [key: string]: any;
    }

    export declare class ComfyList {
        #private;
        element: HTMLDivElement;
        button?: HTMLButtonElement;
        constructor(text: any, type?: any, reverse?: any);
        get visible(): boolean;
        load(): Promise<void>;
        update(): Promise<void>;
        show(): Promise<void>;
        hide(): void;
        toggle(): boolean;
    }

    export export declare type ComfyNodeDef = z.infer<typeof zComfyNodeDef>;

    export declare class ComfyPopup extends EventTarget {
        #private;
        element: HTMLElement;
        open: boolean;
        children: HTMLElement[];
        target: HTMLElement;
        ignoreTarget: boolean;
        container: HTMLElement;
        position: string;
        closeOnEscape: boolean;
        horizontal: string;
        classList: ClassList;
        constructor({ target, container, classList, ignoreTarget, closeOnEscape, position, horizontal }: {
            target: HTMLElement;
            container?: HTMLElement;
            classList?: ClassList;
            ignoreTarget?: boolean;
            closeOnEscape?: boolean;
            position?: 'absolute' | 'relative';
            horizontal?: 'left' | 'right';
        }, ...children: HTMLElement[]);
        toggle(): void;
        update: () => void;
    }

    export declare class ComfySettingsDialog extends ComfyDialog<HTMLDialogElement> {
        app: ComfyApp;
        constructor(app: ComfyApp);
        dispatchChange<T>(id: string, value: T, oldValue?: T): void;
        /**
         * @deprecated Use `settingStore.settingValues` instead.
         */
        get settingsValues(): Record<string, any>;
        /**
         * @deprecated Use `settingStore.settingsById` instead.
         */
        get settingsLookup(): Record<string, SettingParams<any>>;
        /**
         * @deprecated Use `settingStore.settingsById` instead.
         */
        get settingsParamLookup(): Record<string, SettingParams<any>>;
        /**
         * @deprecated Use `settingStore.get` instead.
         */
        getSettingValue<K extends keyof Settings_2>(id: K, defaultValue?: Settings_2[K]): Settings_2[K];
        /**
         * @deprecated Use `settingStore.getDefaultValue` instead.
         */
        getSettingDefaultValue<K extends keyof Settings_2>(id: K): Settings_2[K] | undefined;
        /**
         * @deprecated Use `settingStore.set` instead.
         */
        setSettingValueAsync<K extends keyof Settings_2>(id: K, value: Settings_2[K]): Promise<void>;
        /**
         * @deprecated Use `settingStore.set` instead.
         */
        setSettingValue<K extends keyof Settings_2>(id: K, value: Settings_2[K]): void;
        /**
         * @deprecated Deprecated for external callers/extensions. Use
         * `ComfyExtension.settings` field instead.
         *
         * Example:
         * ```ts
         * app.registerExtension({
         *   name: 'My Extension',
         *   settings: [
         *     {
         *       id: 'My.Setting',
         *       name: 'My Setting',
         *       type: 'text',
         *       defaultValue: 'Hello, world!'
         *     }
         *   ]
         * })
         * ```
         */
        addSetting(params: SettingParams): {
            value: any;
        };
    }

    export declare class ComfyUI {
        app: ComfyApp;
        dialog: ComfyDialog;
        settings: ComfySettingsDialog;
        batchCount: number;
        lastQueueSize: number;
        queue: ComfyList;
        history: ComfyList;
        autoQueueMode: string;
        graphHasChanged: boolean;
        autoQueueEnabled: boolean;
        menuContainer: HTMLDivElement;
        queueSize: Element;
        restoreMenuPosition: () => void;
        loadFile: () => void;
        constructor(app: any);
        setup(containerElement: HTMLElement): void;
        setStatus(status: StatusWsMessageStatus | null): void;
    }

    export declare type ComfyWidgetConstructor = (node: LGraphNode, inputName: string, inputData: InputSpec, app: ComfyApp, widgetName?: string) => {
        widget: IBaseWidget;
        minWidth?: number;
        minHeight?: number;
    };

    export declare class ComfyWorkflow extends UserFile {
        static readonly basePath: string;
        readonly tintCanvasBg?: string;
        /**
         * The change tracker for the workflow. Non-reactive raw object.
         */
        changeTracker: ChangeTracker | null;
        /**
         * Whether the workflow has been modified comparing to the initial state.
         */
        _isModified: boolean;
        /**
         * @param options The path, modified, and size of the workflow.
         * Note: path is the full path, including the 'workflows/' prefix.
         */
        constructor(options: {
            path: string;
            modified: number;
            size: number;
        });
        get key(): string;
        get activeState(): ComfyWorkflowJSON_2 | null;
        get initialState(): ComfyWorkflowJSON_2 | null;
        get isLoaded(): boolean;
        get isModified(): boolean;
        set isModified(value: boolean);
        /**
         * Load the workflow content from remote storage. Directly returns the loaded
         * workflow if the content is already loaded.
         *
         * @param force Whether to force loading the content even if it is already loaded.
         * @returns this
         */
        load({ force }?: {
            force?: boolean;
        }): Promise<this & LoadedComfyWorkflow>;
        unload(): void;
        save(): Promise<UserFile>;
        /**
         * Save the workflow as a new file.
         * @param path The path to save the workflow to. Note: with 'workflows/' prefix.
         * @returns this
         */
        saveAs(path: string): Promise<UserFile>;
        promptSave(): Promise<string | null>;
    }

    export export declare interface CommandManager {
        commands: ComfyCommand[];
        execute(command: string, options?: {
            errorHandler?: (error: unknown) => void;
            metadata?: Record<string, unknown>;
        }): void;
    }

    /** Resize handle positions (compass points) */
    export declare type CompassCorners = 'NE' | 'SE' | 'SW' | 'NW';

    /** Keys (names) of API events that pass a {@link CustomEvent} `detail` object. */
    export declare type ComplexApiEvents = keyof NeverNever_2<ApiEventTypes>;

    export declare interface ConnectByTypeOptions {
        /** @deprecated Events */
        createEventInCase?: boolean;
        /** Allow our wildcard slot to connect to typed slots on remote node. Default: true */
        wildcardToTyped?: boolean;
        /** Allow our typed slot to connect to wildcard slots on remote node. Default: true */
        typedToWildcard?: boolean;
        /** The {@link Reroute.id} that the connection is being dragged from. */
        afterRerouteId?: RerouteId;
    }

    /** Links */
    export declare interface ConnectingLink extends IInputOrOutput {
        node: LGraphNode;
        slot: number;
        pos: Point;
        direction?: LinkDirection;
        afterRerouteId?: RerouteId;
        /** The first reroute on a chain */
        firstRerouteId?: RerouteId;
        /** The link being moved, or `undefined` if creating a new link. */
        link?: LLink;
    }

    /**
     * Basic width and height, with min/max constraints.
     *
     * - The {@link width} and {@link height} properties are readonly
     * - Size is set via {@link desiredWidth} and {@link desiredHeight} properties
     * - Width and height are then updated, clamped to min/max values
     */
    export declare class ConstrainedSize {
        #private;
        minWidth: number;
        minHeight: number;
        maxWidth: number;
        maxHeight: number;
        get width(): number;
        get height(): number;
        get desiredWidth(): number;
        set desiredWidth(value: number);
        get desiredHeight(): number;
        set desiredHeight(value: number);
        constructor(width: number, height: number);
        static fromSize(size: Readonly<Size>): ConstrainedSize;
        static fromRect(rect: ReadOnlyRect): ConstrainedSize;
        setSize(size: Readonly<Size>): void;
        setValues(width: number, height: number): void;
        toSize(): Size;
    }

    export declare interface ContextMenu<TValue = unknown> {
        constructor: new (...args: ConstructorParameters<typeof ContextMenu<TValue>>) => ContextMenu<TValue>;
    }

    /**
     * ContextMenu from LiteGUI
     */
    export declare class ContextMenu<TValue = unknown> {
        options: IContextMenuOptions<TValue>;
        parentMenu?: ContextMenu<TValue>;
        root: ContextMenuDivElement<TValue>;
        current_submenu?: ContextMenu<TValue>;
        lock?: boolean;
        controller: AbortController;
        /**
         * @todo Interface for values requires functionality change - currently accepts
         * an array of strings, functions, objects, nulls, or undefined.
         * @param values (allows object { title: "Nice text", callback: function ... })
         * @param options [optional] Some options:\
         * - title: title to show on top of the menu
         * - callback: function to call when an option is clicked, it receives the item information
         * - ignore_item_callbacks: ignores the callback inside the item, it just calls the options.callback
         * - event: you can pass a MouseEvent, this way the ContextMenu appears in that position
         */
        constructor(values: readonly (string | IContextMenuValue<TValue> | null)[], options: IContextMenuOptions<TValue>);
        /**
         * Checks if {@link node} is inside this context menu or any of its submenus
         * @param node The {@link Node} to check
         * @param visited A set of visited menus to avoid circular references
         * @returns `true` if {@link node} is inside this context menu or any of its submenus
         */
        containsNode(node: Node, visited?: Set<this>): boolean;
        addItem(name: string | null, value: string | IContextMenuValue<TValue> | null, options: IContextMenuOptions<TValue>): HTMLElement;
        close(e?: MouseEvent, ignore_parent_menu?: boolean): void;
        /** @deprecated Likely unused, however code search was inconclusive (too many results to check by hand). */
        static trigger(element: HTMLDivElement, event_name: string, params: MouseEvent): CustomEvent;
        getTopMenu(): ContextMenu<TValue>;
        getFirstEvent(): MouseEvent | undefined;
        /** @deprecated Unused. */
        static isCursorOverElement(event: MouseEvent, element: HTMLDivElement): boolean;
    }

    export declare interface ContextMenuDivElement<TValue = unknown> extends HTMLDivElement {
        value?: string | IContextMenuValue<TValue>;
        onclick_callback?: never;
    }

    /**
     * Create a NodeExecutionId from an array of node IDs
     * @param nodeIds Array of node IDs from root to target
     * @returns A properly formatted NodeExecutionId
     */
    export export declare function createNodeExecutionId(nodeIds: NodeId_2[]): NodeExecutionId;

    /**
     * Create a NodeLocatorId from components
     * @param subgraphUuid The UUID of the immediate containing subgraph
     * @param localNodeId The local node ID within that subgraph
     * @returns A properly formatted NodeLocatorId
     */
    export export declare function createNodeLocatorId(subgraphUuid: string, localNodeId: NodeId_2): NodeLocatorId;

    /**
     * Creates a UUIDv4 string.
     * @returns A new UUIDv4 string
     * @remarks
     * Original implementation from https://gist.github.com/jed/982883?permalink_comment_id=852670#gistcomment-852670
     *
     * Prefers the {@link crypto.randomUUID} method if available, falling back to
     * {@link crypto.getRandomValues}, then finally the legacy {@link Math.random} method.
     */
    export declare function createUuidv4(): UUID;

    export declare class CurveEditor {
        points: Point[];
        selected: number;
        nearest: number;
        size: Rect | null;
        must_update: boolean;
        margin: number;
        _nearest?: number;
        constructor(points: Point[]);
        static sampleCurve(f: number, points: Point[]): number | undefined;
        draw(ctx: CanvasRenderingContext2D, size: Rect, graphcanvas?: LGraphCanvas, background_color?: string, line_color?: string, inactive?: boolean): void;
        onMouseDown(localpos: Point, graphcanvas: LGraphCanvas): boolean | undefined;
        onMouseMove(localpos: Point, graphcanvas: LGraphCanvas): void;
        onMouseUp(): boolean;
        getCloserPoint(pos: Point, max_dist: number): number;
    }

    export declare type CustomBottomPanelExtension = BaseBottomPanelExtension & CustomExtension;

    /**
     * Capable of dispatching strongly-typed events via {@link dispatch}.
     * Overloads are used to ensure detail param is correctly optional.
     */
    export declare interface CustomEventDispatcher<EventMap extends Record<Keys, unknown>, Keys extends keyof EventMap & string = keyof EventMap & string> {
        dispatch<T extends keyof NeverNever<EventMap>>(type: T, detail: EventMap[T]): boolean;
        dispatch<T extends keyof PickNevers<EventMap>>(type: T): boolean;
    }

    /**
     * A strongly-typed, custom {@link EventTarget} that can dispatch and listen for events.
     *
     * 1. Define an event map
     *    ```ts
     *    export interface CustomEventMap {
     *      "my-event": { message: string }
     *      "simple-event": never
     *    }
     *    ```
     *
     * 2. Create an event emitter
     *    ```ts
     *    // By subclassing
     *    class MyClass extends CustomEventTarget<CustomEventMap> {
     *      // ...
     *    }
     *
     *    // Or simply create an instance:
     *    const events = new CustomEventTarget<CustomEventMap>()
     *    ```
     *
     * 3. Dispatch events
     *    ```ts
     *    // Extended class
     *    const myClass = new MyClass()
     *    myClass.dispatch("my-event", { message: "Hello, world!" })
     *    myClass.dispatch("simple-event")
     *
     *    // Instance
     *    const events = new CustomEventTarget<CustomEventMap>()
     *    events.dispatch("my-event", { message: "Hello, world!" })
     *    events.dispatch("simple-event")
     *    ```
     */
    export declare class CustomEventTarget<EventMap extends Record<Keys, unknown>, Keys extends keyof EventMap & string = keyof EventMap & string> extends EventTarget implements ICustomEventTarget<EventMap, Keys> {
        /**
         * Type-safe event dispatching.
         * @see {@link EventTarget.dispatchEvent}
         * @param type Name of the event to dispatch
         * @param detail A custom object to send with the event
         * @returns `true` if the event was dispatched successfully, otherwise `false`.
         */
        dispatch<T extends keyof NeverNever<EventMap>>(type: T, detail: EventMap[T]): boolean;
        dispatch<T extends keyof PickNevers<EventMap>>(type: T): boolean;
        addEventListener<K extends Keys>(type: K, listener: EventListeners<EventMap>[K], options?: boolean | AddEventListenerOptions): void;
        removeEventListener<K extends Keys>(type: K, listener: EventListeners<EventMap>[K], options?: boolean | EventListenerOptions): void;
        /** @deprecated Use {@link dispatch}. */
        dispatchEvent(event: never): boolean;
    }

    export declare interface CustomExtension {
        id: string;
        type: 'custom';
        render: (container: HTMLElement) => void;
        destroy?: () => void;
    }

    export declare type CustomSidebarTabExtension = BaseSidebarTabExtension & CustomExtension;

    export declare interface DefaultConnectionColors {
        getConnectedColor(type: ISlotType): CanvasColour;
        getDisconnectedColor(type: ISlotType): CanvasColour;
    }

    export { DeviceStats }

    export declare type Dictionary<T> = {
        [key: string]: T;
    };

    export declare type Direction = 'top' | 'bottom' | 'left' | 'right';

    /**
     * Calculates the distance between two points (2D vector)
     * @param a Point a as `x, y`
     * @param b Point b as `x, y`
     * @returns Distance between point {@link a} & {@link b}
     */
    export declare function distance(a: Readonly<Point>, b: Readonly<Point>): number;

    /**
     * A DOM widget that wraps a custom HTML element as a litegraph widget.
     */
    export export declare interface DOMWidget<T extends HTMLElement, V extends object | string> extends BaseDOMWidget<V> {
        element: T;
        /**
         * @deprecated Legacy property used by some extensions for customtext
         * (textarea) widgets. Use {@link element} instead as it provides the same
         * functionality and works for all DOMWidget types.
         */
        inputEl?: T;
    }

    export export declare interface DOMWidgetOptions<V extends object | string> extends IWidgetOptions {
        /**
         * Whether to render a placeholder rectangle when zoomed out.
         */
        hideOnZoom?: boolean;
        selectOn?: string[];
        onHide?: (widget: BaseDOMWidget<V>) => void;
        getValue?: () => V;
        setValue?: (value: V) => void;
        getMinHeight?: () => number;
        getMaxHeight?: () => number;
        getHeight?: () => string | number;
        onDraw?: (widget: BaseDOMWidget<V>) => void;
        margin?: number;
        /**
         * @deprecated Use `afterResize` instead. This callback is a legacy API
         * that fires before resize happens, but it is no longer supported. Now it
         * fires after resize happens.
         * The resize logic has been upstreamed to litegraph in
         * https://github.com/Comfy-Org/ComfyUI_frontend/pull/2557
         */
        beforeResize?: (this: BaseDOMWidget<V>, node: LGraphNode) => void;
        afterResize?: (this: BaseDOMWidget<V>, node: LGraphNode) => void;
    }

    export declare class DragAndScale {
        #private;
        /**
         * The state of this DragAndScale instance.
         *
         * Implemented as a POCO that can be proxied without side-effects.
         */
        state: DragAndScaleState;
        lastState: DragAndScaleState;
        /** Maximum scale (zoom in) */
        max_scale: number;
        /** Minimum scale (zoom out) */
        min_scale: number;
        enabled: boolean;
        last_mouse: Point;
        element: HTMLCanvasElement;
        visible_area: Rectangle;
        dragging?: boolean;
        viewport?: Rect;
        onredraw?(das: DragAndScale): void;
        onChanged?(scale: number, offset: Point): void;
        get offset(): [number, number];
        set offset(value: Point);
        get scale(): number;
        set scale(value: number);
        constructor(element: HTMLCanvasElement);
        computeVisibleArea(viewport: Rect | undefined): void;
        toCanvasContext(ctx: CanvasRenderingContext2D): void;
        convertOffsetToCanvas(pos: Point): Point;
        convertCanvasToOffset(pos: Point, out?: Point): Point;
        /** @deprecated Has not been kept up to date */
        mouseDrag(x: number, y: number): void;
        changeScale(value: number, zooming_center?: Point, roundToScaleOne?: boolean): void;
        changeDeltaScale(value: number, zooming_center?: Point): void;
        /**
         * Fits the view to the specified bounds.
         * @param bounds The bounds to fit the view to, defined by a rectangle.
         */
        fitToBounds(bounds: ReadOnlyRect, { zoom }?: {
            zoom?: number;
        }): void;
        /**
         * Starts an animation to fit the view around the specified selection of nodes.
         * @param bounds The bounds to animate the view to, defined by a rectangle.
         */
        animateToBounds(bounds: ReadOnlyRect, setDirty: () => void, { duration, zoom, easing }?: AnimationOptions): void;
        reset(): void;
    }

    export declare interface DragAndScaleState {
        /**
         * The offset from the top-left of the current canvas viewport to `[0, 0]` in graph space.
         * Or said another way, the inverse offset of the viewport.
         */
        offset: [number, number];
        /** The scale of the graph. */
        scale: number;
    }

    export declare interface DrawSlotsOptions {
        fromSlot?: INodeInputSlot | INodeOutputSlot;
        colorContext: DefaultConnectionColors;
        editorAlpha: number;
        lowQuality: boolean;
    }

    export declare interface DrawTitleBoxOptions extends DrawTitleOptions {
        box_size?: number;
    }

    export declare interface DrawTitleOptions {
        scale: number;
        title_height?: number;
        low_quality?: boolean;
    }

    export declare interface DrawTitleTextOptions extends DrawTitleOptions {
        default_title_color: string;
    }

    export declare interface DrawTruncatingTextOptions extends DrawWidgetOptions {
        /** The canvas context to draw the text on. */
        ctx: CanvasRenderingContext2D;
        /** The amount of padding to add to the left of the text. */
        leftPadding?: number;
        /** The amount of padding to add to the right of the text. */
        rightPadding?: number;
    }

    export declare interface DrawWidgetOptions {
        /** The width of the node where this widget will be displayed. */
        width: number;
        /** Synonym for "low quality". */
        showText?: boolean;
    }

    export declare interface DrawWidgetsOptions {
        lowQuality?: boolean;
        editorAlpha?: number;
    }

    export declare enum EaseFunction {
        EASE_IN_OUT_QUAD = "easeInOutQuad"
    }

    export { EmbeddingsResponse }

    /**
     * A virtual slot that simply creates a new input slot when connected to.
     */
    export declare class EmptySubgraphInput extends SubgraphInput {
        parent: SubgraphInputNode;
        constructor(parent: SubgraphInputNode);
        connect(slot: INodeInputSlot, node: LGraphNode, afterRerouteId?: RerouteId): LLink | undefined;
        get labelPos(): Point;
    }

    /**
     * A virtual slot that simply creates a new output slot when connected to.
     */
    export declare class EmptySubgraphOutput extends SubgraphOutput {
        parent: SubgraphOutputNode;
        constructor(parent: SubgraphOutputNode);
        connect(slot: INodeOutputSlot, node: LGraphNode, afterRerouteId?: RerouteId): LLink | undefined;
        get labelPos(): Point;
    }

    export declare type EventListeners<T> = {
        readonly [K in keyof T]: ((this: EventTarget, ev: CustomEvent<T[K]>) => any) | EventListenerObject | null;
    };

    /**
     * Interface describing the data transfer objects used when compiling a graph for execution.
     */
    export declare type ExecutableLGraphNode = Omit<ExecutableNodeDTO, 'graph' | 'node' | 'subgraphNode'>;

    /**
     * Concrete implementation of {@link ExecutableLGraphNode}.
     * @remarks This is the class that is used to create the data transfer objects for executable nodes.
     */
    export declare class ExecutableNodeDTO implements ExecutableLGraphNode {
        #private;
        /** The actual node that this DTO wraps. */
        readonly node: LGraphNode | SubgraphNode;
        /** A list of subgraph instance node IDs from the root graph to the containing instance. @see {@link id} */
        readonly subgraphNodePath: readonly NodeId[];
        /** A flattened map of all DTOs in this node network. Subgraph instances have been expanded into their inner nodes. */
        readonly nodesByExecutionId: Map<ExecutionId, ExecutableLGraphNode>;
        /** The actual subgraph instance that contains this node, otherwise undefined. */
        readonly subgraphNode?: SubgraphNode | undefined;
        applyToGraph?(...args: CallbackParams<typeof ExecutableNodeDTO.node.applyToGraph>): CallbackReturn<typeof ExecutableNodeDTO.node.applyToGraph>;
        /** The graph that this node is a part of. */
        readonly graph: LGraph | Subgraph;
        inputs: {
            linkId: number | null;
            name: string;
            type: ISlotType;
        }[];
        /**
         * The path to the actual node through subgraph instances, represented as a list of all subgraph node IDs (instances),
         * followed by the actual original node ID within the subgraph. Each segment is separated by `:`.
         *
         * e.g. `1:2:3`:
         * - `1` is the node ID of the first subgraph node in the parent workflow
         * - `2` is the node ID of the second subgraph node in the first subgraph
         * - `3` is the node ID of the actual node in the subgraph definition
         */
        get id(): string;
        get type(): string;
        get title(): string;
        get mode(): LGraphEventMode;
        get comfyClass(): string | undefined;
        get isVirtualNode(): boolean | undefined;
        get widgets(): IBaseWidget<string | number | boolean | object | undefined, string, IWidgetOptions<unknown>>[] | undefined;
        get subgraphId(): string | undefined;
        constructor(
        /** The actual node that this DTO wraps. */
        node: LGraphNode | SubgraphNode,
        /** A list of subgraph instance node IDs from the root graph to the containing instance. @see {@link id} */
        subgraphNodePath: readonly NodeId[],
        /** A flattened map of all DTOs in this node network. Subgraph instances have been expanded into their inner nodes. */
        nodesByExecutionId: Map<ExecutionId, ExecutableLGraphNode>,
        /** The actual subgraph instance that contains this node, otherwise undefined. */
        subgraphNode?: SubgraphNode | undefined);
        /** Returns either the DTO itself, or the DTOs of the inner nodes of the subgraph. */
        getInnerNodes(): ExecutableLGraphNode[];
        /**
         * Resolves the executable node & link IDs for a given input slot.
         * @param slot The slot index of the input.
         * @param visited Leave empty unless overriding this method.
         * A set of unique IDs, used to guard against infinite recursion.
         * If overriding, ensure that the set is passed on all recursive calls.
         * @returns The node and the origin ID / slot index of the output.
         */
        resolveInput(slot: number, visited?: Set<string>, type?: ISlotType): ResolvedInput | undefined;
        /**
         * Determines whether this output is a valid endpoint for a link (non-virtual, non-bypass).
         * @param slot The slot index of the output.
         * @param type The type of the input
         * @param visited A set of unique IDs to guard against infinite recursion. See {@link resolveInput}.
         * @returns The node and the origin ID / slot index of the output.
         */
        resolveOutput(slot: number, type: ISlotType, visited: Set<string>): ResolvedInput | undefined;
    }

    export declare type ExecutionId = string;

    /**
     * Defines a subgraph and its contents.
     * Can be referenced multiple times in a schema.
     */
    export declare interface ExportedSubgraph extends SerialisableGraph {
        /** The display name of the subgraph. */
        name: string;
        inputNode: ExportedSubgraphIONode;
        outputNode: ExportedSubgraphIONode;
        /** Ordered list of inputs to the subgraph itself. Similar to a reroute, with the input side in the graph, and the output side in the subgraph. */
        inputs?: SubgraphIO[];
        /** Ordered list of outputs from the subgraph itself. Similar to a reroute, with the input side in the subgraph, and the output side in the graph. */
        outputs?: SubgraphIO[];
        /** A list of node widgets displayed in the parent graph, on the subgraph object. */
        widgets?: ExposedWidget[];
    }

    /** A single instance of a subgraph; where it is used on a graph, any customisation to shape / colour etc. */
    export declare interface ExportedSubgraphInstance extends NodeSubgraphSharedProps {
        /**
         * The ID of the actual subgraph definition.
         * @see {@link ExportedSubgraph.subgraphs}
         */
        type: UUID;
    }

    export declare interface ExportedSubgraphIONode {
        id: NodeId;
        bounding: [number, number, number, number];
        pinned?: boolean;
    }

    /** A reference to a node widget shown in the parent graph */
    export declare interface ExposedWidget {
        /** The ID of the node (inside the subgraph) that the widget belongs to. */
        id: NodeId;
        /** The name of the widget to show in the parent graph. */
        name: string;
    }

    export export declare interface ExtensionManager {
        registerSidebarTab(tab: SidebarTabExtension): void;
        unregisterSidebarTab(id: string): void;
        getSidebarTabs(): SidebarTabExtension[];
        toast: ToastManager;
        dialog: ReturnType<typeof useDialogService>;
        command: CommandManager;
        setting: {
            get: <T = unknown>(id: string) => T | undefined;
            set: <T = unknown>(id: string, value: T) => void;
        };
    }

    export { ExtensionsResponse }

    /**
     * Widget for handling file uploads
     * This is a widget that only has a Vue widgets implementation
     */
    export declare class FileUploadWidget extends BaseWidget<IFileUploadWidget> implements IFileUploadWidget {
        type: "fileupload";
        drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
        onClick(_options: WidgetEventOptions): void;
    }

    export declare interface FindFreeSlotOptions {
        /** Slots matching these types will be ignored.  Default: [] */
        typesNotAccepted?: ISlotType[];
        /** If true, the slot itself is returned instead of the index.  Default: false */
        returnObj?: boolean;
    }

    /**
     * Represents a floating link that is currently being dragged from one slot to another.
     *
     * This is a heavier, but short-lived convenience data structure. All refs to FloatingRenderLinks should be discarded on drop.
     * @remarks
     * At time of writing, Litegraph is using several different styles and methods to handle link dragging.
     *
     * Once the library has undergone more substantial changes to the way links are managed,
     * many properties of this class will be superfluous and removable.
     */
    export declare class FloatingRenderLink implements RenderLink {
        readonly network: LinkNetwork;
        readonly link: LLink;
        readonly toType: 'input' | 'output';
        readonly fromReroute: Reroute;
        readonly dragDirection: LinkDirection;
        readonly node: LGraphNode;
        readonly fromSlot: INodeOutputSlot | INodeInputSlot;
        readonly fromPos: Point;
        readonly fromDirection: LinkDirection;
        readonly fromSlotIndex: number;
        readonly outputNodeId: NodeId;
        readonly outputNode?: LGraphNode;
        readonly outputSlot?: INodeOutputSlot;
        readonly outputIndex: number;
        readonly outputPos?: Point;
        readonly inputNodeId: NodeId;
        readonly inputNode?: LGraphNode;
        readonly inputSlot?: INodeInputSlot;
        readonly inputIndex: number;
        readonly inputPos?: Point;
        constructor(network: LinkNetwork, link: LLink, toType: 'input' | 'output', fromReroute: Reroute, dragDirection?: LinkDirection);
        canConnectToInput(): boolean;
        canConnectToOutput(): boolean;
        canConnectToReroute(reroute: Reroute): boolean;
        canConnectToSubgraphInput(input: SubgraphInput): boolean;
        connectToInput(node: LGraphNode, input: INodeInputSlot, _events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToOutput(node: LGraphNode, output: INodeOutputSlot, _events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToSubgraphInput(input: SubgraphInput, _events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToSubgraphOutput(output: SubgraphOutput, _events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToRerouteInput(reroute: Reroute, { node: inputNode, input }: {
            node: LGraphNode;
            input: INodeInputSlot;
        }, events: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToRerouteOutput(reroute: Reroute, outputNode: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
    }

    /** The input or output slot that an incomplete reroute link is connected to. */
    export declare interface FloatingRerouteSlot {
        /** Floating connection to an input or output */
        slotType: 'input' | 'output';
    }

    /**
     * The base form item for rendering in a form.
     */
    export declare interface FormItem {
        name: string;
        type: SettingInputType | SettingCustomRenderer;
        tooltip?: string;
        attrs?: Record<string, unknown>;
        options?: Array<string | SettingOption>;
    }

    /** Dictionary of Frontend-generated API calls */
    export declare interface FrontendApiCalls {
        graphChanged: ComfyWorkflowJSON;
        promptQueued: {
            number: number;
            batchCount: number;
        };
        graphCleared: never;
        reconnecting: never;
        reconnected: never;
    }

    /**
     * Widget for displaying image galleries
     * This is a widget that only has a Vue widgets implementation
     */
    export declare class GalleriaWidget extends BaseWidget<IGalleriaWidget> implements IGalleriaWidget {
        type: "galleria";
        drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
        onClick(_options: WidgetEventOptions): void;
    }

    export declare type GlobalSubgraphData = {
        name: string;
        info: {
            node_pack: string;
        };
        data: string | Promise<string>;
    };

    /** Internal; simplifies type definitions. */
    export declare type GraphOrSubgraph = LGraph | Subgraph;

    /**
     * Any object that has a {@link boundingRect}.
     */
    export declare interface HasBoundingRect {
        /**
         * A rectangle that represents the outer edges of the item.
         *
         * Used for various calculations, such as overlap, selective rendering, and click checks.
         * For most items, this is cached position & size as `x, y, width, height`.
         * Some items (such as nodes and slots) may extend above and/or to the left of their {@link pos}.
         * @readonly
         * @see {@link move}
         */
        readonly boundingRect: ReadOnlyRect;
    }

    /**
     * An object that can be hovered over.
     */
    export declare interface Hoverable extends HasBoundingRect {
        readonly boundingRect: Rectangle;
        isPointerOver: boolean;
        containsPoint(point: Point): boolean;
        onPointerMove(e: CanvasPointerEvent): void;
        onPointerEnter?(e?: CanvasPointerEvent): void;
        onPointerLeave?(e?: CanvasPointerEvent): void;
    }

    export declare interface IAssetWidget extends IBaseWidget<string, 'asset', IWidgetOptions<string[]>> {
        type: 'asset';
        value: string;
    }

    /**
     * The base type for all widgets.  Should not be implemented directly.
     * @template TValue The type of value this widget holds.
     * @template TType A string designating the type of widget, e.g. "toggle" or "string".
     * @template TOptions The options for this widget.
     * @see IWidget
     */
    export declare interface IBaseWidget<TValue = boolean | number | string | object | undefined, TType extends string = string, TOptions extends IWidgetOptions<unknown> = IWidgetOptions<unknown>> {
        [symbol: symbol]: boolean;
        linkedWidgets?: IBaseWidget[];
        name: string;
        options: TOptions;
        label?: string;
        /** Widget type (see {@link TWidgetType}) */
        type: TType;
        value?: TValue;
        /**
         * Whether the widget value should be serialized on node serialization.
         * @default true
         */
        serialize?: boolean;
        /**
         * The computed height of the widget. Used by customized node resize logic.
         * See scripts/domWidget.ts for more details.
         * @readonly [Computed] This property is computed by the node.
         */
        computedHeight?: number;
        /**
         * The starting y position of the widget after layout.
         * @readonly [Computed] This property is computed by the node.
         */
        y: number;
        /**
         * The y position of the widget after drawing (rendering).
         * @readonly [Computed] This property is computed by the node.
         * @deprecated There is no longer dynamic y adjustment on rendering anymore.
         * Use {@link IBaseWidget.y} instead.
         */
        last_y?: number;
        width?: number;
        /**
         * Whether the widget is disabled. Disabled widgets are rendered at half opacity.
         * See also {@link IBaseWidget.computedDisabled}.
         */
        disabled?: boolean;
        /**
         * The disabled state used for rendering based on various conditions including
         * {@link IBaseWidget.disabled}.
         * @readonly [Computed] This property is computed by the node.
         */
        computedDisabled?: boolean;
        hidden?: boolean;
        advanced?: boolean;
        /**
         * This property is automatically computed on graph change
         * and should not be changed.
         * Promoted widgets have a colored border
         * @see /core/graph/subgraph/proxyWidget.registerProxyWidgets
         */
        promoted?: boolean;
        tooltip?: string;
        callback?(value: any, canvas?: LGraphCanvas, node?: LGraphNode, pos?: Point, e?: CanvasPointerEvent): void;
        /**
         * Simple callback for pointer events, allowing custom widgets to events relevant to them.
         * @param event The pointer event that triggered this callback
         * @param pointerOffset Offset of the pointer relative to {@link node.pos}
         * @param node The node this widget belongs to
         * @todo Expose CanvasPointer API to custom widgets
         */
        mouse?(event: CanvasPointerEvent, pointerOffset: Point, node: LGraphNode): boolean;
        /**
         * Draw the widget.
         * @param ctx The canvas context to draw on.
         * @param node The node this widget belongs to.
         * @param widget_width The width of the widget.
         * @param y The y position of the widget.
         * @param H The height of the widget.
         * @param lowQuality Whether to draw the widget in low quality.
         */
        draw?(ctx: CanvasRenderingContext2D, node: LGraphNode, widget_width: number, y: number, H: number, lowQuality?: boolean): void;
        /**
         * Compatibility method for widgets implementing the draw
         * method when displayed in non-canvas renderers.
         * Set by the current renderer implementation.
         * When called, performs a draw operation.
         */
        triggerDraw?: () => void;
        /**
         * Compute the size of the widget. Overrides {@link IBaseWidget.computeSize}.
         * @param width The width of the widget.
         * @deprecated Use {@link IBaseWidget.computeLayoutSize} instead.
         * @returns The size of the widget.
         */
        computeSize?(width?: number): Size;
        /**
         * Compute the layout size of the widget.
         * @param node The node this widget belongs to.
         * @returns The layout size of the widget.
         */
        computeLayoutSize?(this: IBaseWidget, node: LGraphNode): {
            minHeight: number;
            maxHeight?: number;
            minWidth: number;
            maxWidth?: number;
        };
        /**
         * Callback for pointerdown events, allowing custom widgets to register callbacks to occur
         * for all {@link CanvasPointer} events.
         *
         * This callback is operated early in the pointerdown logic; actions that prevent it from firing are:
         * - `Ctrl + Drag` Multi-select
         * - `Alt + Click/Drag` Clone node
         * @param pointer The CanvasPointer handling this event
         * @param node The node this widget belongs to
         * @param canvas The LGraphCanvas where this event originated
         * @returns Returning `true` from this callback forces Litegraph to ignore the event and
         * not process it any further.
         */
        onPointerDown?(pointer: CanvasPointer, node: LGraphNode, canvas: LGraphCanvas): boolean;
    }

    export declare interface IBooleanWidget extends IBaseWidget<boolean, 'toggle'> {
        type: 'toggle';
        value: boolean;
    }

    export declare interface IBoundaryNodes {
        top: LGraphNode;
        right: LGraphNode;
        bottom: LGraphNode;
        left: LGraphNode;
    }

    export declare interface IButtonWidget extends IBaseWidget<string | undefined, 'button'> {
        type: 'button';
        value: string | undefined;
        clicked: boolean;
    }

    /** For Canvas*Event - adds graph space co-ordinates (property names are shipped) */
    export declare interface ICanvasPosition {
        /** X co-ordinate of the event, in graph space (NOT canvas space) */
        canvasX: number;
        /** Y co-ordinate of the event, in graph space (NOT canvas space) */
        canvasY: number;
    }

    /** Chart widget for displaying data visualizations */
    export declare interface IChartWidget extends IBaseWidget<object, 'chart'> {
        type: 'chart';
        value: object;
    }

    export declare interface ICloseable {
        close(): void;
    }

    /**
     * An object that can be colored with a {@link ColorOption}.
     */
    export declare interface IColorable {
        setColorOption(colorOption: ColorOption | null): void;
        getColorOption(): ColorOption | null;
    }

    /** Color picker widget for selecting colors */
    export declare interface IColorWidget extends IBaseWidget<string, 'color'> {
        type: 'color';
        value: string;
    }

    /** A combo-box widget (dropdown, select, etc) */
    export declare interface IComboWidget extends IBaseWidget<string | number, 'combo', RequiredProps<IWidgetOptions<ComboWidgetValues>, 'values'>> {
        type: 'combo';
        value: string | number;
    }

    export declare interface IContextMenuBase {
        title?: string;
        className?: string;
    }

    /** ContextMenu */
    export declare interface IContextMenuOptions<TValue = unknown, TExtra = unknown> extends IContextMenuBase {
        ignore_item_callbacks?: boolean;
        parentMenu?: ContextMenu<TValue>;
        event?: MouseEvent;
        extra?: TExtra;
        /** @deprecated Context menu scrolling is now controlled by the browser */
        scroll_speed?: number;
        left?: number;
        top?: number;
        /** @deprecated Context menus no longer scale using transform */
        scale?: number;
        node?: LGraphNode;
        autoopen?: boolean;
        callback?(value?: string | IContextMenuValue<TValue>, options?: unknown, event?: MouseEvent, previous_menu?: ContextMenu<TValue>, extra?: unknown): void | boolean | Promise<void | boolean>;
    }

    export declare interface IContextMenuSubmenu<TValue = unknown> extends IContextMenuOptions<TValue> {
        options: ConstructorParameters<typeof ContextMenu<TValue>>[0];
    }

    export declare interface IContextMenuValue<TValue = unknown, TExtra = unknown, TCallbackValue = unknown> extends IContextMenuBase {
        value?: TValue;
        content: string | undefined;
        has_submenu?: boolean;
        disabled?: boolean;
        submenu?: IContextMenuSubmenu<TValue>;
        property?: string;
        type?: string;
        slot?: IFoundSlot;
        callback?(this: ContextMenuDivElement<TValue>, value?: TCallbackValue, options?: unknown, event?: MouseEvent, previous_menu?: ContextMenu<TValue>, extra?: TExtra): void | boolean | Promise<void | boolean>;
    }

    export declare interface ICreateDefaultNodeOptions extends ICreateNodeOptions {
        /** Position of new node */
        position: Point;
        /** adjust x,y */
        posAdd?: Point;
        /** alpha, adjust the position x,y based on the new node size w,h */
        posSizeFix?: Point;
    }

    export declare interface ICreateNodeOptions {
        /** input */
        nodeFrom?: SubgraphInputNode | LGraphNode | null;
        /** input */
        slotFrom?: number | INodeOutputSlot | INodeInputSlot | SubgraphIO | null;
        /** output */
        nodeTo?: SubgraphOutputNode | LGraphNode | null;
        /** output */
        slotTo?: number | INodeOutputSlot | INodeInputSlot | SubgraphIO | null;
        /** pass the event coords */
        /** Create the connection from a reroute */
        afterRerouteId?: RerouteId;
        /** choose a nodetype to add, AUTO to set at first good */
        nodeType?: string;
        e?: CanvasPointerEvent;
        allow_searchbox?: boolean;
    }

    export declare interface ICreatePanelOptions {
        closable?: any;
        window?: any;
        onOpen?: () => void;
        onClose?: () => void;
        width?: any;
        height?: any;
    }

    /**
     * Has strongly-typed overrides of {@link EventTarget.addEventListener} and {@link EventTarget.removeEventListener}.
     */
    export declare interface ICustomEventTarget<EventMap extends Record<Keys, unknown>, Keys extends keyof EventMap & string = keyof EventMap & string> {
        addEventListener<K extends Keys>(type: K, listener: EventListeners<EventMap>[K], options?: boolean | AddEventListenerOptions): void;
        removeEventListener<K extends Keys>(type: K, listener: EventListeners<EventMap>[K], options?: boolean | EventListenerOptions): void;
        /** @deprecated Use {@link dispatch}. */
        dispatchEvent(event: never): boolean;
    }

    /** A custom widget - accepts any value and has no built-in special handling */
    export declare interface ICustomWidget extends IBaseWidget<string | object, 'custom'> {
        type: 'custom';
        value: string | object;
    }

    /** For Canvas*Event */
    export declare interface IDeltaPosition {
        deltaX: number;
        deltaY: number;
    }

    export declare interface IDialog extends HTMLDivElement, IDialogExtensions {
    }

    export declare interface IDialogExtensions extends ICloseable {
        modified(): void;
        is_modified: boolean;
    }

    export declare interface IDialogOptions {
        position?: Point;
        event?: MouseEvent;
        checkForInput?: boolean;
        closeOnLeave?: boolean;
        onclose?(): void;
    }

    export declare interface IDrawBoundingOptions {
        /** The shape to render */
        shape?: RenderShape;
        /** The radius of the rounded corners for {@link RenderShape.ROUND} and {@link RenderShape.CARD} */
        round_radius?: number;
        /** Shape will extend above the Y-axis 0 by this amount @deprecated This is node-specific: it should be removed entirely, and behaviour defined by the caller more explicitly */
        title_height?: number;
        /** @deprecated This is node-specific: it should be removed entirely, and behaviour defined by the caller more explicitly */
        title_mode?: TitleMode;
        /** The color that should be drawn */
        color?: CanvasColour;
        /** The distance between the edge of the {@link area} and the middle of the line */
        padding?: number;
        /** @deprecated This is node-specific: it should be removed entirely, and behaviour defined by the caller more explicitly */
        collapsed?: boolean;
        /** Thickness of the line drawn (`lineWidth`) */
        lineWidth?: number;
    }

    /** File upload widget for selecting and uploading files */
    export declare interface IFileUploadWidget extends IBaseWidget<string, 'fileupload'> {
        type: 'fileupload';
        value: string;
        label?: string;
    }

    export declare interface IFoundSlot extends IInputOrOutput {
        slot: number;
        link_pos: Point;
    }

    /** Gallery widget for displaying multiple images */
    export declare interface IGalleriaWidget extends IBaseWidget<string[], 'galleria'> {
        type: 'galleria';
        value: string[];
    }

    export declare interface IGraphGroupFlags extends Record<string, unknown> {
        pinned?: true;
    }

    /** Image comparison widget for comparing two images side by side */
    export declare interface IImageCompareWidget extends IBaseWidget<string[], 'imagecompare'> {
        type: 'imagecompare';
        value: string[];
    }

    /** Image display widget */
    export declare interface IImageWidget extends IBaseWidget<string, 'image'> {
        type: 'image';
        value: string;
    }

    export declare interface IInputOrOutput {
        input?: INodeInputSlot | null;
        output?: INodeOutputSlot | null;
    }

    export declare interface IKnobWidget extends IBaseWidget<number, 'knob', IWidgetKnobOptions> {
        type: 'knob';
        value: number;
        options: IWidgetKnobOptions;
    }

    /**
     * Widget for comparing two images side by side
     * This is a widget that only has a Vue widgets implementation
     */
    export declare class ImageCompareWidget extends BaseWidget<IImageCompareWidget> implements IImageCompareWidget {
        type: "imagecompare";
        drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
        onClick(_options: WidgetEventOptions): void;
    }

    /** Markdown widget for displaying formatted text */
    export declare interface IMarkdownWidget extends IBaseWidget<string, 'markdown'> {
        type: 'markdown';
        value: string;
    }

    export declare interface IMouseOverData {
        inputId?: number;
        outputId?: number;
        overWidget?: IBaseWidget;
    }

    /** Multi-select widget for selecting multiple options */
    export declare interface IMultiSelectWidget extends IBaseWidget<string[], 'multiselect'> {
        type: 'multiselect';
        value: string[];
    }

    export declare interface INodeFlags {
        skip_repeated_outputs?: boolean;
        allow_interaction?: boolean;
        pinned?: boolean;
        collapsed?: boolean;
        /** Configuration setting for {@link LGraphNode.connectInputToOutput} */
        keepAllLinksOnBypass?: boolean;
    }

    export declare interface INodeInputSlot extends INodeSlot {
        link: LinkId | null;
        widget?: IWidgetLocator;
        alwaysVisible?: boolean;
        /**
         * Internal use only; API is not finalised and may change at any time.
         */
        _widget?: IBaseWidget;
    }

    export declare interface INodeOutputSlot extends INodeSlot {
        links: LinkId[] | null;
        _data?: unknown;
        slot_index?: number;
    }

    export declare interface INodePropertyInfo {
        name: string;
        type?: string;
        default_value: NodeProperty | undefined;
    }

    export declare interface INodeSlot extends HasBoundingRect {
        /**
         * The name of the slot in English.
         * Will be included in the serialized data.
         */
        name: string;
        /**
         * The localized name of the slot to display in the UI.
         * Takes higher priority than {@link name} if set.
         * Will be included in the serialized data.
         */
        localized_name?: string;
        /**
         * The name of the slot to display in the UI, modified by the user.
         * Takes higher priority than {@link display_name} if set.
         * Will be included in the serialized data.
         */
        label?: string;
        type: ISlotType;
        dir?: LinkDirection;
        removable?: boolean;
        shape?: RenderShape;
        color_off?: CanvasColour;
        color_on?: CanvasColour;
        locked?: boolean;
        nameLocked?: boolean;
        pos?: Point;
        /** @remarks Automatically calculated; not included in serialisation. */
        boundingRect: ReadOnlyRect;
        /**
         * A list of floating link IDs that are connected to this slot.
         * This is calculated at runtime; it is **not** serialized.
         */
        _floatingLinks?: Set<LLink>;
        /**
         * Whether the slot has errors. It is **not** serialized.
         */
        hasErrors?: boolean;
    }

    export declare type INodeSlotContextItem = [
    string,
    ISlotType,
    Partial<INodeInputSlot & INodeOutputSlot>
    ];

    /**
     * A class that can be added to the render cycle to show pointer / keyboard status symbols.
     *
     * Used to create videos of feature changes.
     *
     * Example usage with ComfyUI_frontend, via console / devtools:
     *
     * ```ts
     * const inputIndicators = new InputIndicators(canvas)
     * // Dispose:
     * inputIndicators.dispose()
     * ```
     */
    export declare class InputIndicators implements Disposable {
        #private;
        canvas: LGraphCanvas;
        radius: number;
        startAngle: number;
        endAngle: number;
        inactiveColour: string;
        colour1: string;
        colour2: string;
        colour3: string;
        fontString: string;
        enabled: boolean;
        shiftDown: boolean;
        undoDown: boolean;
        redoDown: boolean;
        ctrlDown: boolean;
        altDown: boolean;
        mouse0Down: boolean;
        mouse1Down: boolean;
        mouse2Down: boolean;
        x: number;
        y: number;
        controller?: AbortController;
        constructor(canvas: LGraphCanvas);
        onPointerDownOrMove(e: MouseEvent): void;
        onPointerUp(): void;
        onKeyDownOrUp(e: KeyboardEvent): void;
        draw(): void;
        dispose(): void;
        [Symbol.dispose](): void;
    }

    export export declare type InputSpec = z.infer<typeof zInputSpec>;

    /** Any widget that uses a numeric backing */
    export declare interface INumericWidget extends IBaseWidget<number, 'number'> {
        type: 'number';
        value: number;
    }

    /**
     * Workaround for Firefox returning 0 on offsetX/Y props
     * See https://github.com/Comfy-Org/litegraph.js/issues/403 for details
     */
    export declare interface IOffsetWorkaround {
        /** See {@link MouseEvent.offsetX}.  This workaround is required (2024-12-31) to support Firefox, which always returns 0 */
        safeOffsetX: number;
        /** See {@link MouseEvent.offsetY}.  This workaround is required (2024-12-31) to support Firefox, which always returns 0 */
        safeOffsetY: number;
    }

    /** Options for {@link LGraphCanvas.pasteFromClipboard}. */
    export declare interface IPasteFromClipboardOptions {
        /** If `true`, always attempt to connect inputs of pasted nodes - including to nodes that were not pasted. */
        connectInputs?: boolean;
        /** The position to paste the items at. */
        position?: Point;
    }

    /**
     * An object that can be pinned.
     *
     * Prevents the object being accidentally moved or resized by mouse interaction.
     */
    export declare interface IPinnable {
        readonly pinned: boolean;
        pin(value?: boolean): void;
        unpin(): void;
    }

    /** Select button widget for selecting from a group of buttons */
    export declare interface ISelectButtonWidget extends IBaseWidget<string, 'selectbutton', RequiredProps<IWidgetOptions<string[]>, 'values'>> {
        type: 'selectbutton';
        value: string;
    }

    export declare type ISerialisableNodeInput = Omit<INodeInputSlot, 'boundingRect' | 'widget'> & {
        widget?: {
            name: string;
        };
    };

    export declare type ISerialisableNodeOutput = Omit<INodeOutputSlot, 'boundingRect' | '_data'> & {
        widget?: {
            name: string;
        };
    };

    /**
     * Original implementation from static litegraph.d.ts
     * Maintained for backwards compat
     */
    export declare interface ISerialisedGraph extends BaseExportedGraph {
        last_node_id: NodeId;
        last_link_id: number;
        nodes: ISerialisedNode[];
        links: SerialisedLLinkArray[];
        floatingLinks?: SerialisableLLink[];
        groups: ISerialisedGroup[];
        version: typeof LiteGraph.VERSION;
        extra?: LGraphExtra;
    }

    /** Serialised LGraphGroup */
    export declare interface ISerialisedGroup {
        id: number;
        title: string;
        bounding: number[];
        color?: string;
        font_size?: number;
        flags?: IGraphGroupFlags;
    }

    /** Serialised LGraphNode */
    export declare interface ISerialisedNode {
        title?: string;
        id: NodeId;
        type: string;
        pos: Point;
        size: Size;
        flags: INodeFlags;
        order: number;
        mode: number;
        outputs?: ISerialisableNodeOutput[];
        inputs?: ISerialisableNodeInput[];
        properties?: Dictionary<NodeProperty | undefined>;
        shape?: RenderShape;
        boxcolor?: string;
        color?: string;
        bgcolor?: string;
        showAdvanced?: boolean;
        /**
         * Note: Some custom nodes overrides the `widgets_values` property to an
         * object that has `length` property and index access. It is not safe to call
         * any array methods on it.
         * See example in https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/blob/8629188458dc6cb832f871ece3bd273507e8a766/web/js/VHS.core.js#L59-L84
         */
        widgets_values?: TWidgetValue[];
    }

    export declare interface IShowSearchOptions {
        node_to?: LGraphNode | null;
        node_from?: LGraphNode | null;
        slot_from: number | INodeOutputSlot | INodeInputSlot | null | undefined;
        type_filter_in?: ISlotType;
        type_filter_out?: ISlotType | false;
        do_type_filter?: boolean;
        show_general_if_none_on_typefilter?: boolean;
        show_general_after_typefiltered?: boolean;
        hide_on_mouse_leave?: boolean;
        show_all_if_empty?: boolean;
        show_all_on_open?: boolean;
    }

    /**
     * Determines whether a point (`x, y`) is inside a rectangle.
     *
     * This is the original litegraph implementation.  It returns `false` if `x` is equal to `left`, or `y` is equal to `top`.
     * @deprecated
     * Use {@link isInRectangle} to match inclusive of top left.
     * This function returns a false negative when an integer point (e.g. pixel) is on the leftmost or uppermost edge of a rectangle.
     * @param x Point x
     * @param y Point y
     * @param left Rect x
     * @param top Rect y
     * @param width Rect width
     * @param height Rect height
     * @returns `true` if the point is inside the rect, otherwise `false`
     */
    export declare function isInsideRectangle(x: number, y: number, left: number, top: number, width: number, height: number): boolean;

    export declare interface ISliderWidget extends IBaseWidget<number, 'slider', IWidgetSliderOptions> {
        type: 'slider';
        value: number;
        marker?: number;
    }

    /**
     * A string that represents a specific data / slot type, e.g. `STRING`.
     *
     * Can be comma-delimited to specify multiple allowed types, e.g. `STRING,INT`.
     */
    export declare type ISlotType = number | string;

    /**
     * Type guard to check if a value is a NodeExecutionId
     */
    export export declare function isNodeExecutionId(value: unknown): value is NodeExecutionId;

    /**
     * Type guard to check if a value is a NodeLocatorId
     */
    export export declare function isNodeLocatorId(value: unknown): value is NodeLocatorId;

    /** Avoids the type issues with the legacy IComboWidget type */
    export declare interface IStringComboWidget extends IBaseWidget<string, 'combo', RequiredProps<IWidgetOptions<string[]>, 'values'>> {
        type: 'combo';
        value: string;
    }

    /** A widget with a string value */
    export declare interface IStringWidget extends IBaseWidget<string, 'string' | 'text', IWidgetOptions<string[]>> {
        type: 'string' | 'text';
        value: string;
    }

    export declare interface ISubgraphInput extends INodeInputSlot {
        _listenerController?: AbortController;
        _subgraphSlot: SubgraphInput;
    }

    /**
     * Locates graph items.
     */
    export declare interface ItemLocator {
        getNodeOnPos(x: number, y: number, nodeList?: LGraphNode[]): LGraphNode | null;
        getRerouteOnPos(x: number, y: number): Reroute | undefined;
        getIoNodeOnPos?(x: number, y: number): SubgraphInputNode | SubgraphOutputNode | undefined;
    }

    /** Textarea widget for multi-line text input */
    export declare interface ITextareaWidget extends IBaseWidget<string, 'textarea'> {
        type: 'textarea';
        value: string;
    }

    /** Tree select widget for hierarchical selection */
    export declare interface ITreeSelectWidget extends IBaseWidget<string | string[], 'treeselect'> {
        type: 'treeselect';
        value: string | string[];
    }

    /**
     * A widget for a node.
     * All types are based on IBaseWidget - additions can be made there or directly on individual types.
     *
     * Implemented as a discriminative union of widget types, so this type itself cannot be extended.
     * Recommend declaration merging any properties that use IWidget (e.g. {@link LGraphNode.widgets}) with a new type alias.
     * @see ICustomWidget
     */
    export declare type IWidget = IBooleanWidget | INumericWidget | IStringWidget | IComboWidget | IStringComboWidget | ICustomWidget | ISliderWidget | IButtonWidget | IKnobWidget | IFileUploadWidget | IColorWidget | IMarkdownWidget | IImageWidget | ITreeSelectWidget | IMultiSelectWidget | IChartWidget | IGalleriaWidget | IImageCompareWidget | ISelectButtonWidget | ITextareaWidget | IAssetWidget;

    export declare interface IWidgetKnobOptions extends IWidgetOptions<number[]> {
        min: number;
        max: number;
        step2: number;
        slider_color?: CanvasColour;
        marker_color?: CanvasColour;
        gradient_stops?: string;
    }

    /**
     * A widget that is linked to a slot.
     *
     * This is set by the ComfyUI_frontend logic. See
     * https://github.com/Comfy-Org/ComfyUI_frontend/blob/b80e0e1a3c74040f328c4e344326c969c97f67e0/src/extensions/core/widgetInputs.ts#L659
     */
    export declare interface IWidgetLocator {
        name: string;
    }

    export declare interface IWidgetOptions<TValues = unknown[]> {
        on?: string;
        off?: string;
        max?: number;
        min?: number;
        slider_color?: CanvasColour;
        marker_color?: CanvasColour;
        precision?: number;
        read_only?: boolean;
        /**
         * @deprecated Use {@link IWidgetOptions.step2} instead.
         * The legacy step is scaled up by 10x in the legacy frontend logic.
         */
        step?: number;
        /** The step value for numeric widgets. */
        step2?: number;
        y?: number;
        multiline?: boolean;
        property?: string;
        /** If `true`, an input socket will not be created for this widget. */
        socketless?: boolean;
        /** If `true`, the widget will not be rendered by the Vue renderer. */
        canvasOnly?: boolean;
        values?: TValues;
        /** Optional function to format values for display (e.g., hash → human-readable name) */
        getOptionLabel?: (value?: string | null) => string;
        callback?: IWidget['callback'];
        iconClass?: string;
    }

    export declare interface IWidgetSliderOptions extends IWidgetOptions<number[]> {
        min: number;
        max: number;
        step2: number;
        slider_color?: CanvasColour;
        marker_color?: CanvasColour;
    }

    export declare type Keybinding = z.infer<typeof zKeybinding>;

    /** Union of property names that are of type Match */
    export declare type KeysOfType<T, Match> = Exclude<{
        [P in keyof T]: T[P] extends Match ? P : never;
    }[keyof T], undefined>;

    export declare class KnobWidget extends BaseWidget<IKnobWidget> implements IKnobWidget {
        type: "knob";
        /**
         * Compute the layout size of the widget.
         * @returns The layout size of the widget.
         */
        computeLayoutSize(): {
            minHeight: number;
            maxHeight?: number;
            minWidth: number;
            maxWidth?: number;
        };
        get height(): number;
        drawWidget(ctx: CanvasRenderingContext2D, { width, showText }: DrawWidgetOptions): void;
        onClick(): void;
        current_drag_offset: number;
        onDrag(options: WidgetEventOptions): void;
    }

    export declare enum LabelPosition {
        Left = "left",
        Right = "right"
    }

    export declare interface LegacyMouseEvent {
        /** @deprecated Part of DragAndScale mouse API - incomplete / not maintained */
        dragging?: boolean;
        click_time?: number;
    }

    /**
     * Wraps a legacy POJO custom widget, so that all widgets may be called via the same internal interface.
     *
     * Support will eventually be removed.
     * @remarks Expect this class to undergo breaking changes without warning.
     */
    export declare class LegacyWidget<TWidget extends IBaseWidget = IBaseWidget> extends BaseWidget<TWidget> implements IBaseWidget {
        draw?(ctx: CanvasRenderingContext2D, node: LGraphNode, widget_width: number, y: number, H: number, lowQuality?: boolean): void;
        drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
        onClick(): void;
    }

    /**
     * LGraph is the class that contain a full graph. We instantiate one and add nodes to it, and then we can run the execution loop.
     * supported callbacks:
     * + onNodeAdded: when a new node is added to the graph
     * + onNodeRemoved: when a node inside this graph is removed
     */
    export declare class LGraph implements LinkNetwork, BaseLGraph, Serialisable<SerialisableGraph> {
        #private;
        static serialisedSchemaVersion: 1;
        static STATUS_STOPPED: number;
        static STATUS_RUNNING: number;
        /** List of LGraph properties that are manually handled by {@link LGraph.configure}. */
        static readonly ConfigureProperties: Set<string>;
        id: UUID;
        revision: number;
        _version: number;
        /** The backing store for links.  Keys are wrapped in String() */
        _links: Map<LinkId, LLink>;
        /**
         * Indexed property access is deprecated.
         * Backwards compatibility with a Proxy has been added, but will eventually be removed.
         *
         * Use {@link Map} methods:
         * ```
         * const linkId = 123
         * const link = graph.links.get(linkId)
         * // Deprecated: const link = graph.links[linkId]
         * ```
         */
        links: Map<LinkId, LLink> & Record<LinkId, LLink>;
        list_of_graphcanvas: LGraphCanvas[] | null;
        status: number;
        state: LGraphState;
        readonly events: CustomEventTarget<LGraphEventMap, "configuring" | "configured" | "subgraph-created" | "convert-to-subgraph" | "open-subgraph">;
        readonly _subgraphs: Map<UUID, Subgraph>;
        _nodes: (LGraphNode | SubgraphNode)[];
        _nodes_by_id: Record<NodeId, LGraphNode>;
        _nodes_in_order: LGraphNode[];
        _nodes_executable: LGraphNode[] | null;
        _groups: LGraphGroup[];
        iteration: number;
        globaltime: number;
        /** @deprecated Unused */
        runningtime: number;
        fixedtime: number;
        fixedtime_lapse: number;
        elapsed_time: number;
        last_update_time: number;
        starttime: number;
        catch_errors: boolean;
        execution_timer_id?: number | null;
        errors_in_execution?: boolean;
        /** @deprecated Unused */
        execution_time: number;
        _last_trigger_time?: number;
        filter?: string;
        /** Must contain serialisable values, e.g. primitive types */
        config: LGraphConfig;
        vars: Dictionary<unknown>;
        nodes_executing: boolean[];
        nodes_actioning: (string | boolean)[];
        nodes_executedAction: string[];
        extra: LGraphExtra;
        /** @deprecated Deserialising a workflow sets this unused property. */
        version?: number;
        /** @returns Whether the graph has no items */
        get empty(): boolean;
        /** @returns All items on the canvas that can be selected */
        positionableItems(): Generator<LGraphNode | LGraphGroup | Reroute>;
        private readonly floatingLinksInternal;
        get floatingLinks(): ReadonlyMap<LinkId, LLink>;
        private readonly reroutesInternal;
        /** All reroutes in this graph. */
        get reroutes(): Map<RerouteId, Reroute>;
        get rootGraph(): LGraph;
        get isRootGraph(): boolean;
        /** @deprecated See {@link state}.{@link LGraphState.lastNodeId lastNodeId} */
        get last_node_id(): number;
        set last_node_id(value: number);
        /** @deprecated See {@link state}.{@link LGraphState.lastLinkId lastLinkId} */
        get last_link_id(): number;
        set last_link_id(value: number);
        onAfterStep?(): void;
        onBeforeStep?(): void;
        onPlayEvent?(): void;
        onStopEvent?(): void;
        onAfterExecute?(): void;
        onExecuteStep?(): void;
        onNodeAdded?(node: LGraphNode): void;
        onNodeRemoved?(node: LGraphNode): void;
        onTrigger?: LGraphTriggerHandler;
        onBeforeChange?(graph: LGraph, info?: LGraphNode): void;
        onAfterChange?(graph: LGraph, info?: LGraphNode | null): void;
        onConnectionChange?(node: LGraphNode): void;
        on_change?(graph: LGraph): void;
        onSerialize?(data: ISerialisedGraph | SerialisableGraph): void;
        onConfigure?(data: ISerialisedGraph | SerialisableGraph): void;
        onGetNodeMenuOptions?(options: (IContextMenuValue<unknown> | null)[], node: LGraphNode): void;
        private _input_nodes?;
        /**
         * See {@link LGraph}
         * @param o data from previous serialization [optional]
         */
        constructor(o?: ISerialisedGraph | SerialisableGraph);
        /**
         * Removes all nodes from this graph
         */
        clear(): void;
        get subgraphs(): Map<UUID, Subgraph>;
        get nodes(): (LGraphNode | SubgraphNode)[];
        get groups(): LGraphGroup[];
        /**
         * Attach Canvas to this graph
         */
        attachCanvas(canvas: LGraphCanvas): void;
        /**
         * Detach Canvas from this graph
         */
        detachCanvas(canvas: LGraphCanvas): void;
        /**
         * @deprecated Will be removed in 0.9
         * Starts running this graph every interval milliseconds.
         * @param interval amount of milliseconds between executions, if 0 then it renders to the monitor refresh rate
         */
        start(interval?: number): void;
        /**
         * @deprecated Will be removed in 0.9
         * Stops the execution loop of the graph
         */
        stop(): void;
        /**
         * Run N steps (cycles) of the graph
         * @param num number of steps to run, default is 1
         * @param do_not_catch_errors [optional] if you want to try/catch errors
         * @param limit max number of nodes to execute (used to execute from start to a node)
         */
        runStep(num: number, do_not_catch_errors: boolean, limit?: number): void;
        /**
         * Updates the graph execution order according to relevance of the nodes (nodes with only outputs have more relevance than
         * nodes with only inputs.
         */
        updateExecutionOrder(): void;
        computeExecutionOrder(only_onExecute: boolean, set_level?: boolean): LGraphNode[];
        /**
         * Positions every node in a more readable manner
         */
        arrange(margin?: number, layout?: string): void;
        /**
         * Returns the amount of time the graph has been running in milliseconds
         * @returns number of milliseconds the graph has been running
         */
        getTime(): number;
        /**
         * Returns the amount of time accumulated using the fixedtime_lapse var.
         * This is used in context where the time increments should be constant
         * @returns number of milliseconds the graph has been running
         */
        getFixedTime(): number;
        /**
         * Returns the amount of time it took to compute the latest iteration.
         * Take into account that this number could be not correct
         * if the nodes are using graphical actions
         * @returns number of milliseconds it took the last cycle
         */
        getElapsedTime(): number;
        /**
         * @deprecated Will be removed in 0.9
         * Sends an event to all the nodes, useful to trigger stuff
         * @param eventname the name of the event (function to be called)
         * @param params parameters in array format
         */
        sendEventToAllNodes(eventname: string, params?: object | object[], mode?: LGraphEventMode): void;
        /**
         * Runs an action on every canvas registered to this graph.
         * @param action Action to run for every canvas
         */
        canvasAction(action: (canvas: LGraphCanvas) => void): void;
        /** @deprecated See {@link LGraph.canvasAction} */
        sendActionToCanvas<T extends MethodNames<LGraphCanvas>>(action: T, params?: ParamsArray<LGraphCanvas, T>): void;
        /**
         * Adds a new node instance to this graph
         * @param node the instance of the node
         */
        add(node: LGraphNode | LGraphGroup, skip_compute_order?: boolean): LGraphNode | null | undefined;
        /**
         * Removes a node from the graph
         * @param node the instance of the node
         */
        remove(node: LGraphNode | LGraphGroup): void;
        /**
         * Returns a node by its id.
         */
        getNodeById(id: NodeId | null | undefined): LGraphNode | null;
        /**
         * Returns a list of nodes that matches a class
         * @param classObject the class itself (not an string)
         * @returns a list with all the nodes of this type
         */
        findNodesByClass(classObject: Function, result?: LGraphNode[]): LGraphNode[];
        /**
         * Returns a list of nodes that matches a type
         * @param type the name of the node type
         * @returns a list with all the nodes of this type
         */
        findNodesByType(type: string, result: LGraphNode[]): LGraphNode[];
        /**
         * Returns the first node that matches a name in its title
         * @param title the name of the node to search
         * @returns the node or null
         */
        findNodeByTitle(title: string): LGraphNode | null;
        /**
         * Returns a list of nodes that matches a name
         * @param title the name of the node to search
         * @returns a list with all the nodes with this name
         */
        findNodesByTitle(title: string): LGraphNode[];
        /**
         * Returns the top-most node in this position of the canvas
         * @param x the x coordinate in canvas space
         * @param y the y coordinate in canvas space
         * @param nodeList a list with all the nodes to search from, by default is all the nodes in the graph
         * @returns the node at this position or null
         */
        getNodeOnPos(x: number, y: number, nodeList?: LGraphNode[]): LGraphNode | null;
        /**
         * Returns the top-most group in that position
         * @param x The x coordinate in canvas space
         * @param y The y coordinate in canvas space
         * @returns The group or null
         */
        getGroupOnPos(x: number, y: number): LGraphGroup | undefined;
        /**
         * Returns the top-most group with a titlebar in the provided position.
         * @param x The x coordinate in canvas space
         * @param y The y coordinate in canvas space
         * @returns The group or null
         */
        getGroupTitlebarOnPos(x: number, y: number): LGraphGroup | undefined;
        /**
         * Finds a reroute a the given graph point
         * @param x X co-ordinate in graph space
         * @param y Y co-ordinate in graph space
         * @returns The first reroute under the given co-ordinates, or undefined
         */
        getRerouteOnPos(x: number, y: number, reroutes?: Iterable<Reroute>): Reroute | undefined;
        /**
         * Snaps the provided items to a grid.
         *
         * Item positions are rounded to the nearest multiple of {@link LiteGraph.CANVAS_GRID_SIZE}.
         *
         * When {@link LiteGraph.alwaysSnapToGrid} is enabled
         * and the grid size is falsy, a default of 1 is used.
         * @param items The items to be snapped to the grid
         * @todo Currently only snaps nodes.
         */
        snapToGrid(items: Set<Positionable>): void;
        /**
         * Finds the size of the grid that items should be snapped to when moved.
         * @returns The size of the grid that items should be snapped to
         */
        getSnapToGridSize(): number;
        /**
         * @deprecated Will be removed in 0.9
         * Checks that the node type matches the node type registered,
         * used when replacing a nodetype by a newer version during execution
         * this replaces the ones using the old version with the new version
         */
        checkNodeTypes(): void;
        trigger<A extends LGraphTriggerAction>(action: A, param: LGraphTriggerParam<A>): void;
        trigger(action: string, param: unknown): void;
        /** @todo Clean up - never implemented. */
        triggerInput(name: string, value: any): void;
        /** @todo Clean up - never implemented. */
        setCallback(name: string, func: any): void;
        beforeChange(info?: LGraphNode): void;
        afterChange(info?: LGraphNode | null): void;
        /**
         * clears the triggered slot animation in all links (stop visual animation)
         */
        clearTriggeredSlots(): void;
        change(): void;
        setDirtyCanvas(fg: boolean, bg?: boolean): void;
        addFloatingLink(link: LLink): LLink;
        removeFloatingLink(link: LLink): void;
        /**
         * Finds the link with the provided ID.
         * @param id ID of link to find
         * @returns The link with the provided {@link id}, otherwise `undefined`. Always returns `undefined` if `id` is nullish.
         */
        getLink(id: null | undefined): undefined;
        getLink(id: LinkId | null | undefined): LLink | undefined;
        /**
         * Finds the reroute with the provided ID.
         * @param id ID of reroute to find
         * @returns The reroute with the provided {@link id}, otherwise `undefined`. Always returns `undefined` if `id` is nullish.
         */
        getReroute(id: null | undefined): undefined;
        getReroute(id: RerouteId | null | undefined): Reroute | undefined;
        /**
         * Configures a reroute on the graph where ID is already known (probably deserialisation).
         * Creates the object if it does not exist.
         * @param serialisedReroute See {@link SerialisableReroute}
         */
        setReroute({ id, parentId, pos, linkIds, floating }: OptionalProps<SerialisableReroute, 'id'>): Reroute;
        /**
         * Creates a new reroute and adds it to the graph.
         * @param pos Position in graph space
         * @param before The existing link segment (reroute, link) that will be after this reroute,
         * going from the node output to input.
         * @returns The newly created reroute - typically ignored.
         */
        createReroute(pos: Point, before: LinkSegment): Reroute;
        /**
         * Removes a reroute from the graph
         * @param id ID of reroute to remove
         */
        removeReroute(id: RerouteId): void;
        /**
         * Destroys a link
         */
        removeLink(link_id: LinkId): void;
        /**
         * Creates a new subgraph definition, and adds it to the graph.
         * @param data Exported data (typically serialised) to configure the new subgraph with
         * @returns The newly created subgraph definition.
         */
        createSubgraph(data: ExportedSubgraph): Subgraph;
        convertToSubgraph(items: Set<Positionable>): {
            subgraph: Subgraph;
            node: SubgraphNode;
        };
        unpackSubgraph(subgraphNode: SubgraphNode, options?: {
            skipMissingNodes?: boolean;
        }): void;
        /**
         * Resolve a path of subgraph node IDs into a list of subgraph nodes.
         * Not intended to be run from subgraphs.
         * @param nodeIds An ordered list of node IDs, from the root graph to the most nested subgraph node
         * @returns An ordered list of nested subgraph nodes.
         */
        resolveSubgraphIdPath(nodeIds: readonly NodeId[]): SubgraphNode[];
        /**
         * Creates a Object containing all the info about this graph, it can be serialized
         * @deprecated Use {@link asSerialisable}, which returns the newer schema version.
         * @returns value of the node
         */
        serialize(option?: {
            sortNodes: boolean;
        }): ISerialisedGraph;
        /**
         * Prepares a shallow copy of this object for immediate serialisation or structuredCloning.
         * The return value should be discarded immediately.
         * @param options Serialise options = currently `sortNodes: boolean`, whether to sort nodes by ID.
         * @returns A shallow copy of parts of this graph, with shallow copies of its serialisable objects.
         * Mutating the properties of the return object may result in changes to your graph.
         * It is intended for use with {@link structuredClone} or {@link JSON.stringify}.
         */
        asSerialisable(options?: {
            sortNodes: boolean;
        }): SerialisableGraph & Required<Pick<SerialisableGraph, 'nodes' | 'groups' | 'extra'>>;
        protected _configureBase(data: ISerialisedGraph | SerialisableGraph): void;
        /**
         * Configure a graph from a JSON string
         * @param data The deserialised object to configure this graph from
         * @param keep_old If `true`, the graph will not be cleared prior to
         * adding the configuration.
         */
        configure(data: ISerialisedGraph | SerialisableGraph, keep_old?: boolean): boolean | undefined;
        get primaryCanvas(): LGraphCanvas | undefined;
        set primaryCanvas(canvas: LGraphCanvas);
        load(url: string | Blob | URL | File, callback: () => void): void;
    }

    export declare class LGraphBadge {
        text: string;
        fgColor: string;
        bgColor: string;
        fontSize: number;
        padding: number;
        height: number;
        cornerRadius: number;
        icon?: LGraphIcon;
        xOffset: number;
        yOffset: number;
        constructor({ text, fgColor, bgColor, fontSize, padding, height, cornerRadius, iconOptions, xOffset, yOffset }: LGraphBadgeOptions);
        get visible(): boolean;
        getWidth(ctx: CanvasRenderingContext2D): number;
        draw(ctx: CanvasRenderingContext2D, x: number, y: number): void;
    }

    export declare interface LGraphBadgeOptions {
        text: string;
        fgColor?: string;
        bgColor?: string;
        fontSize?: number;
        padding?: number;
        height?: number;
        cornerRadius?: number;
        iconOptions?: LGraphIconOptions;
        xOffset?: number;
        yOffset?: number;
    }

    export declare class LGraphButton extends LGraphBadge {
        name?: string;
        _last_area: Rectangle;
        constructor(options: LGraphButtonOptions);
        getWidth(ctx: CanvasRenderingContext2D): number;
        /* Excluded from this release type: draw */
        /**
         * Checks if a point is inside the button's last rendered area.
         * @param x The x-coordinate of the point.
         * @param y The y-coordinate of the point.
         * @returns `true` if the point is inside the button, otherwise `false`.
         */
        isPointInside(x: number, y: number): boolean;
    }

    export declare interface LGraphButtonOptions extends LGraphBadgeOptions {
        name?: string;
    }

    /**
     * This class is in charge of rendering one graph inside a canvas. And provides all the interaction required.
     * Valid callbacks are: onNodeSelected, onNodeDeselected, onShowNodePanel, onNodeDblClicked
     */
    export declare class LGraphCanvas implements CustomEventDispatcher<LGraphCanvasEventMap> {
        #private;
        static DEFAULT_BACKGROUND_IMAGE: string;
        static DEFAULT_EVENT_LINK_COLOR: string;
        /** Link type to colour dictionary. */
        static link_type_colors: Dictionary<string>;
        static gradients: Record<string, CanvasGradient>;
        static search_limit: number;
        static node_colors: Record<string, ColorOption>;
        /* Excluded from this release type: _measureText */
        /**
         * The state of this canvas, e.g. whether it is being dragged, or read-only.
         *
         * Implemented as a POCO that can be proxied without side-effects.
         */
        state: LGraphCanvasState;
        get subgraph(): Subgraph | undefined;
        set subgraph(value: Subgraph | undefined);
        /**
         * The location of the fps info widget. Leaving an element unset will use the default position for that element.
         */
        fpsInfoLocation: [x: number | null | undefined, y: number | null | undefined] | null | undefined;
        /** Dispatches a custom event on the canvas. */
        dispatch<T extends keyof NeverNever<LGraphCanvasEventMap>>(type: T, detail: LGraphCanvasEventMap[T]): boolean;
        dispatch<T extends keyof PickNevers<LGraphCanvasEventMap>>(type: T): boolean;
        dispatchEvent<TEvent extends keyof LGraphCanvasEventMap>(type: TEvent, detail: LGraphCanvasEventMap[TEvent]): void;
        private _previously_dragging_canvas;
        /** @deprecated @inheritdoc {@link LGraphCanvasState.readOnly} */
        get read_only(): boolean;
        set read_only(value: boolean);
        get isDragging(): boolean;
        set isDragging(value: boolean);
        get hoveringOver(): CanvasItem;
        set hoveringOver(value: CanvasItem);
        /** @deprecated Replace all references with {@link pointer}.{@link CanvasPointer.isDown isDown}. */
        get pointer_is_down(): boolean;
        /** @deprecated Replace all references with {@link pointer}.{@link CanvasPointer.isDouble isDouble}. */
        get pointer_is_double(): boolean;
        /** @deprecated @inheritdoc {@link LGraphCanvasState.draggingCanvas} */
        get dragging_canvas(): boolean;
        set dragging_canvas(value: boolean);
        /**
         * @deprecated Use {@link LGraphNode.titleFontStyle} instead.
         */
        get title_text_font(): string;
        get inner_text_font(): string;
        /** Maximum frames per second to render. 0: unlimited. Default: 0 */
        get maximumFps(): number;
        set maximumFps(value: number);
        /**
         * @deprecated Use {@link LiteGraphGlobal.ROUND_RADIUS} instead.
         */
        get round_radius(): number;
        /**
         * @deprecated Use {@link LiteGraphGlobal.ROUND_RADIUS} instead.
         */
        set round_radius(value: number);
        private _lowQualityZoomThreshold;
        private _isLowQuality;
        /**
         * Updates the low quality zoom threshold based on current settings.
         * Called when min_font_size_for_lod or DPR changes.
         */
        private updateLowQualityThreshold;
        /**
         * Render low quality when zoomed out based on minimum readable font size.
         */
        get low_quality(): boolean;
        options: {
            skip_events?: any;
            viewport?: any;
            skip_render?: any;
            autoresize?: any;
        };
        background_image: string;
        readonly ds: DragAndScale;
        readonly pointer: CanvasPointer;
        zoom_modify_alpha: boolean;
        zoom_speed: number;
        node_title_color: string;
        default_link_color: string;
        default_connection_color: {
            input_off: string;
            input_on: string;
            output_off: string;
            output_on: string;
        };
        default_connection_color_byType: Dictionary<CanvasColour>;
        default_connection_color_byTypeOff: Dictionary<CanvasColour>;
        /** Gets link colours. Extremely basic impl. until the legacy object dictionaries are removed. */
        colourGetter: DefaultConnectionColors;
        highquality_render: boolean;
        use_gradients: boolean;
        editor_alpha: number;
        pause_rendering: boolean;
        clear_background: boolean;
        clear_background_color: string;
        render_only_selected: boolean;
        show_info: boolean;
        allow_dragcanvas: boolean;
        allow_dragnodes: boolean;
        allow_interaction: boolean;
        multi_select: boolean;
        allow_searchbox: boolean;
        allow_reconnect_links: boolean;
        align_to_grid: boolean;
        drag_mode: boolean;
        dragging_rectangle: Rect | null;
        filter?: string | null;
        set_canvas_dirty_on_mouse_event: boolean;
        always_render_background: boolean;
        render_shadows: boolean;
        render_canvas_border: boolean;
        render_connections_shadows: boolean;
        render_connections_border: boolean;
        render_curved_connections: boolean;
        render_connection_arrows: boolean;
        render_collapsed_slots: boolean;
        render_execution_order: boolean;
        render_link_tooltip: boolean;
        /** Shape of the markers shown at the midpoint of links.  Default: Circle */
        linkMarkerShape: LinkMarkerShape;
        links_render_mode: number;
        /** Minimum font size in pixels before switching to low quality rendering.
         * This initializes first and if we can't get the value from the settings we default to 8px
         */
        private _min_font_size_for_lod;
        get min_font_size_for_lod(): number;
        set min_font_size_for_lod(value: number);
        /** mouse in canvas coordinates, where 0,0 is the top-left corner of the blue rectangle */
        readonly mouse: Point;
        /** mouse in graph coordinates, where 0,0 is the top-left corner of the blue rectangle */
        readonly graph_mouse: Point;
        /** @deprecated LEGACY: REMOVE THIS, USE {@link graph_mouse} INSTEAD */
        canvas_mouse: Point;
        /** to personalize the search box */
        onSearchBox?: (helper: Element, str: string, canvas: LGraphCanvas) => any;
        onSearchBoxSelection?: (name: any, event: any, canvas: LGraphCanvas) => void;
        onMouse?: (e: CanvasPointerEvent) => boolean;
        /** to render background objects (behind nodes and connections) in the canvas affected by transform */
        onDrawBackground?: (ctx: CanvasRenderingContext2D, visible_area: any) => void;
        /** to render foreground objects (above nodes and connections) in the canvas affected by transform */
        onDrawForeground?: (arg0: CanvasRenderingContext2D, arg1: any) => void;
        connections_width: number;
        /** The current node being drawn by {@link drawNode}.  This should NOT be used to determine the currently selected node.  See {@link selectedItems} */
        current_node: LGraphNode | null;
        /** used for widgets */
        node_widget?: [LGraphNode, IBaseWidget] | null;
        /** The link to draw a tooltip for. */
        over_link_center?: LinkSegment;
        last_mouse_position: Point;
        /** The visible area of this canvas.  Tightly coupled with {@link ds}. */
        visible_area: Rectangle;
        /** Contains all links and reroutes that were rendered.  Repopulated every render cycle. */
        renderedPaths: Set<LinkSegment>;
        /** @deprecated Replaced by {@link renderedPaths}, but length is set to 0 by some extensions. */
        visible_links: LLink[];
        /** @deprecated This array is populated and cleared to support legacy extensions. The contents are ignored by Litegraph. */
        connecting_links: ConnectingLink[] | null;
        linkConnector: LinkConnector;
        /** The viewport of this canvas.  Tightly coupled with {@link ds}. */
        readonly viewport?: Rect;
        autoresize: boolean;
        static active_canvas: LGraphCanvas;
        frame: number;
        last_draw_time: number;
        render_time: number;
        fps: number;
        /** @deprecated See {@link LGraphCanvas.selectedItems} */
        selected_nodes: Dictionary<LGraphNode>;
        /** All selected nodes, groups, and reroutes */
        selectedItems: Set<Positionable>;
        /** The group currently being resized. */
        resizingGroup: LGraphGroup | null;
        /** @deprecated See {@link LGraphCanvas.selectedItems} */
        selected_group: LGraphGroup | null;
        /** The nodes that are currently visible on the canvas. */
        visible_nodes: LGraphNode[];
        node_over?: LGraphNode;
        node_capturing_input?: LGraphNode | null;
        highlighted_links: Dictionary<boolean>;
        dirty_canvas: boolean;
        dirty_bgcanvas: boolean;
        /** A map of nodes that require selective-redraw */
        dirty_nodes: Map<NodeId, LGraphNode>;
        dirty_area?: Rect | null;
        /** @deprecated Unused */
        node_in_panel?: LGraphNode | null;
        last_mouse: Readonly<Point>;
        last_mouseclick: number;
        graph: LGraph | Subgraph | null;
        get _graph(): LGraph | Subgraph;
        canvas: HTMLCanvasElement & ICustomEventTarget<LGraphCanvasEventMap>;
        bgcanvas: HTMLCanvasElement;
        ctx: CanvasRenderingContext2D;
        _events_binded?: boolean;
        _mousedown_callback?(e: PointerEvent): void;
        _mousewheel_callback?(e: WheelEvent): void;
        _mousemove_callback?(e: PointerEvent): void;
        _mouseup_callback?(e: PointerEvent): void;
        _mouseout_callback?(e: PointerEvent): void;
        _mousecancel_callback?(e: PointerEvent): void;
        _key_callback?(e: KeyboardEvent): void;
        bgctx?: CanvasRenderingContext2D | null;
        is_rendering?: boolean;
        /** @deprecated Panels */
        block_click?: boolean;
        /** @deprecated Panels */
        last_click_position?: Point | null;
        resizing_node?: LGraphNode | null;
        /** @deprecated See {@link LGraphCanvas.resizingGroup} */
        selected_group_resizing?: boolean;
        /** @deprecated See {@link pointer}.{@link CanvasPointer.dragStarted dragStarted} */
        last_mouse_dragging?: boolean;
        onMouseDown?: (arg0: CanvasPointerEvent) => void;
        _highlight_pos?: Point;
        _highlight_input?: INodeInputSlot;
        /** @deprecated Panels */
        node_panel?: any;
        /** @deprecated Panels */
        options_panel?: any;
        _bg_img?: HTMLImageElement;
        _pattern?: CanvasPattern;
        _pattern_img?: HTMLImageElement;
        bg_tint?: string | CanvasGradient | CanvasPattern;
        prompt_box?: PromptDialog | null;
        search_box?: HTMLDivElement;
        /** @deprecated Panels */
        SELECTED_NODE?: LGraphNode;
        /** @deprecated Panels */
        NODEPANEL_IS_OPEN?: boolean;
        /** Link rendering adapter for litegraph-to-canvas integration */
        linkRenderer: LitegraphLinkAdapter | null;
        /** If true, enable drag zoom. Ctrl+Shift+Drag Up/Down: zoom canvas. */
        dragZoomEnabled: boolean;
        /** If true, enable live selection during drag. Nodes are selected/deselected in real-time. */
        liveSelection: boolean;
        getMenuOptions?(): IContextMenuValue<string>[];
        getExtraMenuOptions?(canvas: LGraphCanvas, options: (IContextMenuValue<string> | null)[]): (IContextMenuValue<string> | null)[];
        static active_node: LGraphNode;
        /** called before modifying the graph */
        onBeforeChange?(graph: LGraph): void;
        /** called after modifying the graph */
        onAfterChange?(graph: LGraph): void;
        onClear?: () => void;
        /** called after moving a node @deprecated Does not handle multi-node move, and can return the wrong node. */
        onNodeMoved?: (node_dragged: LGraphNode | undefined) => void;
        /** @deprecated Called with the deprecated {@link selected_nodes} when the selection changes. Replacement not yet impl. */
        onSelectionChange?: (selected: Dictionary<Positionable>) => void;
        /** called when rendering a tooltip */
        onDrawLinkTooltip?: (ctx: CanvasRenderingContext2D, link: LLink | null, canvas?: LGraphCanvas) => boolean;
        /** to render foreground objects not affected by transform (for GUIs) */
        onDrawOverlay?: (ctx: CanvasRenderingContext2D) => void;
        onRenderBackground?: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => boolean;
        onNodeDblClicked?: (n: LGraphNode) => void;
        onShowNodePanel?: (n: LGraphNode) => void;
        onNodeSelected?: (node: LGraphNode) => void;
        onNodeDeselected?: (node: LGraphNode) => void;
        onRender?: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void;
        /**
         * Creates a new instance of LGraphCanvas.
         * @param canvas The canvas HTML element (or its id) to use, or null / undefined to leave blank.
         * @param graph The graph that owns this canvas.
         * @param options
         */
        constructor(canvas: HTMLCanvasElement, graph: LGraph, options?: LGraphCanvas['options']);
        static onGroupAdd(info: unknown, entry: unknown, mouse_event: MouseEvent): void;
        /**
         * @deprecated Functionality moved to {@link getBoundaryNodes}.  The new function returns null on failure, instead of an object with all null properties.
         * Determines the furthest nodes in each direction
         * @param nodes the nodes to from which boundary nodes will be extracted
         * @returns
         */
        static getBoundaryNodes(nodes: LGraphNode[] | Dictionary<LGraphNode>): NullableProperties<IBoundaryNodes>;
        /**
         * @deprecated Functionality moved to {@link alignNodes}.  The new function does not set dirty canvas.
         * @param nodes a list of nodes
         * @param direction Direction to align the nodes
         * @param align_to Node to align to (if null, align to the furthest node in the given direction)
         */
        static alignNodes(nodes: Dictionary<LGraphNode>, direction: Direction, align_to?: LGraphNode): void;
        static onNodeAlign(value: IContextMenuValue, options: IContextMenuOptions, event: MouseEvent, prev_menu: ContextMenu<string>, node: LGraphNode): void;
        static onGroupAlign(value: IContextMenuValue, options: IContextMenuOptions, event: MouseEvent, prev_menu: ContextMenu<string>): void;
        static createDistributeMenu(value: IContextMenuValue, options: IContextMenuOptions, event: MouseEvent, prev_menu: ContextMenu<string>): void;
        static onMenuAdd(value: unknown, options: unknown, e: MouseEvent, prev_menu?: ContextMenu<string>, callback?: (node: LGraphNode | null) => void): boolean | undefined;
        static onMenuCollapseAll(): void;
        static onMenuNodeEdit(): void;
        /** @param _options Parameter is never used */
        static showMenuNodeOptionalOutputs(v: unknown,
        /** Unused - immediately overwritten */
        _options: INodeOutputSlot[], e: MouseEvent, prev_menu: ContextMenu<INodeSlotContextItem>, node: LGraphNode): boolean | undefined;
        /** @param value Parameter is never used */
        static onShowMenuNodeProperties(value: NodeProperty | undefined, options: unknown, e: MouseEvent, prev_menu: ContextMenu<string>, node: LGraphNode): boolean | undefined;
        /** @deprecated */
        static decodeHTML(str: string): string;
        static onMenuResizeNode(value: IContextMenuValue, options: IContextMenuOptions, e: MouseEvent, menu: ContextMenu, node: LGraphNode): void;
        static onShowPropertyEditor(item: {
            property: keyof LGraphNode;
            type: string;
        }, options: IContextMenuOptions<string>, e: MouseEvent, menu: ContextMenu<string>, node: LGraphNode): void;
        static getPropertyPrintableValue(value: unknown, values: unknown[] | object | undefined): string | undefined;
        static onMenuNodeCollapse(value: IContextMenuValue, options: IContextMenuOptions, e: MouseEvent, menu: ContextMenu, node: LGraphNode): void;
        static onMenuToggleAdvanced(value: IContextMenuValue, options: IContextMenuOptions, e: MouseEvent, menu: ContextMenu, node: LGraphNode): void;
        static onMenuNodeMode(value: IContextMenuValue, options: IContextMenuOptions, e: MouseEvent, menu: ContextMenu, node: LGraphNode): boolean;
        /** @param value Parameter is never used */
        static onMenuNodeColors(value: IContextMenuValue<string | null>, options: IContextMenuOptions, e: MouseEvent, menu: ContextMenu<string | null>, node: LGraphNode): boolean;
        static onMenuNodeShapes(value: IContextMenuValue<(typeof LiteGraph.VALID_SHAPES)[number]>, options: IContextMenuOptions<(typeof LiteGraph.VALID_SHAPES)[number]>, e: MouseEvent, menu?: ContextMenu<(typeof LiteGraph.VALID_SHAPES)[number]>, node?: LGraphNode): boolean;
        static onMenuNodeRemove(): void;
        static onMenuNodeClone(_value: IContextMenuValue, _options: IContextMenuOptions, _e: MouseEvent, _menu: ContextMenu, node: LGraphNode): void;
        static cloneNodes(nodes: Positionable[]): ClipboardPasteResult | undefined;
        /**
         * clears all the data inside
         *
         */
        clear(): void;
        /**
         * Assigns a new graph to this canvas.
         */
        setGraph(newGraph: LGraph | Subgraph): void;
        openSubgraph(subgraph: Subgraph, fromNode: SubgraphNode): void;
        /**
         * @returns the visually active graph (in case there are more in the stack)
         */
        getCurrentGraph(): LGraph | null;
        /**
         * Sets the current HTML canvas element.
         * Calls bindEvents to add input event listeners, and (re)creates the background canvas.
         * @param canvas The canvas element to assign, or its HTML element ID.  If null or undefined, the current reference is cleared.
         * @param skip_events If true, events on the previous canvas will not be removed.  Has no effect on the first invocation.
         */
        setCanvas(canvas: string | HTMLCanvasElement, skip_events?: boolean): void;
        /** Captures an event and prevents default - returns false. */
        _doNothing(e: Event): boolean;
        /** Captures an event and prevents default - returns true. */
        _doReturnTrue(e: Event): boolean;
        /**
         * binds mouse, keyboard, touch and drag events to the canvas
         */
        bindEvents(): void;
        /**
         * unbinds mouse events from the canvas
         */
        unbindEvents(): void;
        /**
         * Ensures the canvas will be redrawn on the next frame by setting the dirty flag(s).
         * Without parameters, this function does nothing.
         * @todo Impl. `setDirty()` or similar as shorthand to redraw everything.
         * @param fgcanvas If true, marks the foreground canvas as dirty (nodes and anything drawn on top of them).  Default: false
         * @param bgcanvas If true, mark the background canvas as dirty (background, groups, links).  Default: false
         */
        setDirty(fgcanvas: boolean, bgcanvas?: boolean): void;
        /**
         * Used to attach the canvas in a popup
         * @returns returns the window where the canvas is attached (the DOM root node)
         */
        getCanvasWindow(): Window;
        /**
         * starts rendering the content of the canvas when needed
         *
         */
        startRendering(): void;
        /**
         * stops rendering the content of the canvas (to save resources)
         *
         */
        stopRendering(): void;
        blockClick(): void;
        /**
         * Gets the widget at the current cursor position.
         * @param node Optional node to check for widgets under cursor
         * @returns The widget located at the current cursor position, if any is found.
         * @deprecated Use {@link LGraphNode.getWidgetOnPos} instead.
         * ```ts
         * const [x, y] = canvas.graph_mouse
         * const widget = canvas.node_over?.getWidgetOnPos(x, y, true)
         * ```
         */
        getWidgetAtCursor(node?: LGraphNode): IBaseWidget | undefined;
        /**
         * Clears highlight and mouse-over information from nodes that should not have it.
         *
         * Intended to be called when the pointer moves away from a node.
         * @param node The node that the mouse is now over
         * @param e MouseEvent that is triggering this
         */
        updateMouseOverNodes(node: LGraphNode | null, e: CanvasPointerEvent): void;
        processMouseDown(e: MouseEvent): void;
        processWidgetClick(e: CanvasPointerEvent, node: LGraphNode, widget: IBaseWidget, pointer?: CanvasPointer): void;
        /**
         * Called when a mouse move event has to be processed
         */
        processMouseMove(e: PointerEvent): void;
        /**
         * Called when a mouse up event has to be processed
         */
        processMouseUp(e: PointerEvent): void;
        /**
         * Called when the mouse moves off the canvas.  Clears all node hover states.
         * @param e
         */
        processMouseOut(e: PointerEvent): void;
        processMouseCancel(): void;
        /**
         * Called when a mouse wheel event has to be processed
         */
        processMouseWheel(e: WheelEvent): void;
        /**
         * process a key event
         */
        processKey(e: KeyboardEvent): void;
        _serializeItems(items?: Iterable<Positionable>): ClipboardItems_2;
        /**
         * Copies canvas items to an internal, app-specific clipboard backed by local storage.
         * When called without parameters, it copies {@link selectedItems}.
         * @param items The items to copy.  If nullish, all selected items are copied.
         */
        copyToClipboard(items?: Iterable<Positionable>): string;
        emitEvent(detail: LGraphCanvasEventMap['litegraph:canvas']): void;
        /** @todo Refactor to where it belongs - e.g. Deleting / creating nodes is not actually canvas event. */
        emitBeforeChange(): void;
        /** @todo See {@link emitBeforeChange} */
        emitAfterChange(): void;
        /**
         * Pastes the items from the canvas "clipbaord" - a local storage variable.
         */
        _pasteFromClipboard(options?: IPasteFromClipboardOptions): ClipboardPasteResult | undefined;
        _deserializeItems(parsed: ClipboardItems_2, options: IPasteFromClipboardOptions): ClipboardPasteResult | undefined;
        pasteFromClipboard(options?: IPasteFromClipboardOptions): void;
        processNodeDblClicked(n: LGraphNode): void;
        /**
         * Handles live selection updates during drag. Called on each pointer move.
         * @param e The pointer move event
         * @param dragRect The current drag rectangle
         * @param initialSelection The selection state before the drag started
         */
        private handleLiveSelect;
        /**
         * Finalizes the live selection when drag ends.
         */
        private finalizeLiveSelect;
        /**
         * Determines whether to select or deselect an item that has received a pointer event.  Will deselect other nodes if
         * @param item Canvas item to select/deselect
         * @param e The MouseEvent to handle
         * @param sticky Prevents deselecting individual nodes (as used by aux/right-click)
         * @remarks
         * Accessibility: anyone using {@link mutli_select} always deselects when clicking empty space.
         */
        processSelect<TPositionable extends Positionable = LGraphNode>(item: TPositionable | null | undefined, e: CanvasPointerEvent | undefined, sticky?: boolean): void;
        /**
         * Selects a {@link Positionable} item.
         * @param item The canvas item to add to the selection.
         */
        select<TPositionable extends Positionable = LGraphNode>(item: TPositionable): void;
        /**
         * Deselects a {@link Positionable} item.
         * @param item The canvas item to remove from the selection.
         */
        deselect<TPositionable extends Positionable = LGraphNode>(item: TPositionable): void;
        /** @deprecated See {@link LGraphCanvas.processSelect} */
        processNodeSelected(item: LGraphNode, e: CanvasPointerEvent): void;
        /** @deprecated See {@link LGraphCanvas.select} */
        selectNode(node: LGraphNode, add_to_current_selection?: boolean): void;
        get empty(): boolean;
        get positionableItems(): Generator<LGraphNode | Reroute | LGraphGroup, any, any>;
        /**
         * Selects several items.
         * @param items Items to select - if falsy, all items on the canvas will be selected
         * @param add_to_current_selection If set, the items will be added to the current selection instead of replacing it
         */
        selectItems(items?: Positionable[], add_to_current_selection?: boolean): void;
        /**
         * selects several nodes (or adds them to the current selection)
         * @deprecated See {@link LGraphCanvas.selectItems}
         */
        selectNodes(nodes?: LGraphNode[], add_to_current_selection?: boolean): void;
        /** @deprecated See {@link LGraphCanvas.deselect} */
        deselectNode(node: LGraphNode): void;
        /**
         * Deselects all items on the canvas.
         * @param keepSelected If set, this item will not be removed from the selection.
         */
        deselectAll(keepSelected?: Positionable): void;
        /** @deprecated See {@link LGraphCanvas.deselectAll} */
        deselectAllNodes(): void;
        /**
         * Deletes all selected items from the graph.
         * @todo Refactor deletion task to LGraph.  Selection is a canvas property, delete is a graph action.
         */
        deleteSelected(): void;
        /**
         * deletes all nodes in the current selection from the graph
         * @deprecated See {@link LGraphCanvas.deleteSelected}
         */
        deleteSelectedNodes(): void;
        /**
         * centers the camera on a given node
         */
        centerOnNode(node: LGraphNode): void;
        /**
         * adds some useful properties to a mouse event, like the position in graph coordinates
         */
        adjustMouseEvent<T extends MouseEvent>(e: T & Partial<CanvasPointerExtensions>): asserts e is T & CanvasPointerEvent;
        /**
         * changes the zoom level of the graph (default is 1), you can pass also a place used to pivot the zoom
         */
        setZoom(value: number, zooming_center: Point): void;
        /**
         * converts a coordinate from graph coordinates to canvas2D coordinates
         */
        convertOffsetToCanvas(pos: Point, out: Point): Point;
        /**
         * converts a coordinate from Canvas2D coordinates to graph space
         */
        convertCanvasToOffset(pos: Point, out?: Point): Point;
        convertEventToCanvasOffset(e: MouseEvent): Point;
        /**
         * brings a node to front (above all other nodes)
         */
        bringToFront(node: LGraphNode): void;
        /**
         * sends a node to the back (below all other nodes)
         */
        sendToBack(node: LGraphNode): void;
        /**
         * Determines which nodes are visible and populates {@link out} with the results.
         * @param nodes The list of nodes to check - if falsy, all nodes in the graph will be checked
         * @param out Array to write visible nodes into - if falsy, a new array is created instead
         * @returns Array passed ({@link out}), or a new array containing all visible nodes
         */
        computeVisibleNodes(nodes?: LGraphNode[], out?: LGraphNode[]): LGraphNode[];
        /**
         * Checks if a node is visible on the canvas.
         * @param node The node to check
         * @returns `true` if the node is visible, otherwise `false`
         */
        isNodeVisible(node: LGraphNode): boolean;
        /**
         * renders the whole canvas content, by rendering in two separated canvas, one containing the background grid and the connections, and one containing the nodes)
         */
        draw(force_canvas?: boolean, force_bgcanvas?: boolean): void;
        /**
         * draws the front canvas (the one containing all the nodes)
         */
        drawFrontCanvas(): void;
        /**
         * draws some useful stats in the corner of the canvas
         */
        renderInfo(ctx: CanvasRenderingContext2D, x: number, y: number): void;
        /**
         * draws the back canvas (the one containing the background and the connections)
         */
        drawBackCanvas(): void;
        /**
         * draws the given node inside the canvas
         */
        drawNode(node: LGraphNode, ctx: CanvasRenderingContext2D): void;
        /**
         * Draws the link mouseover effect and tooltip.
         * @param ctx Canvas 2D context to draw on
         * @param link The link to render the mouseover effect for
         * @remarks
         * Called against {@link LGraphCanvas.over_link_center}.
         * @todo Split tooltip from hover, so it can be drawn / eased separately
         */
        drawLinkTooltip(ctx: CanvasRenderingContext2D, link: LinkSegment): void;
        /**
         * Draws the shape of the given node on the canvas
         * @param node The node to draw
         * @param ctx 2D canvas rendering context used to draw
         * @param size Size of the background to draw, in graph units.  Differs from node size if collapsed, etc.
         * @param fgcolor Foreground colour - used for text
         * @param bgcolor Background colour of the node
         * @param _selected Whether to render the node as selected.  Likely to be removed in future, as current usage is simply the selected property of the node.
         */
        drawNodeShape(node: LGraphNode, ctx: CanvasRenderingContext2D, size: Size, fgcolor: CanvasColour, bgcolor: CanvasColour, _selected: boolean): void;
        /**
         * Draws a snap guide for a {@link Positionable} item.
         *
         * Initial design was a simple white rectangle representing the location the
         * item would land if dropped.
         * @param ctx The 2D canvas context to draw on
         * @param item The item to draw a snap guide for
         * @param shape The shape of the snap guide to draw
         * @todo Update to align snapping with boundingRect
         * @todo Shapes
         */
        drawSnapGuide(ctx: CanvasRenderingContext2D, item: Positionable, shape?: RenderShape): void;
        drawConnections(ctx: CanvasRenderingContext2D): void;
        private getNodeModeAlpha;
        /**
         * Build LinkRenderContext from canvas properties
         * Helper method for using LitegraphLinkAdapter
         */
        private buildLinkRenderContext;
        /**
         * draws a link between two points
         * @param ctx Canvas 2D rendering context
         * @param a start pos
         * @param b end pos
         * @param link the link object with all the link info
         * @param skip_border ignore the shadow of the link
         * @param flow show flow animation (for events)
         * @param color the color for the link
         * @param start_dir the direction enum
         * @param end_dir the direction enum
         */
        renderLink(ctx: CanvasRenderingContext2D, a: Readonly<Point>, b: Readonly<Point>, link: LLink | null, skip_border: boolean, flow: number | null, color: CanvasColour | null, start_dir: LinkDirection, end_dir: LinkDirection, { startControl, endControl, reroute, num_sublines, disabled }?: {
            /** When defined, render data will be saved to this reroute instead of the {@link link}. */
            reroute?: Reroute;
            /** Offset of the bezier curve control point from {@link a point a} (output side) */
            startControl?: Readonly<Point>;
            /** Offset of the bezier curve control point from {@link b point b} (input side) */
            endControl?: Readonly<Point>;
            /** Number of sublines (useful to represent vec3 or rgb) @todo If implemented, refactor calculations out of the loop */
            num_sublines?: number;
            /** Whether this is a floating link segment */
            disabled?: boolean;
        }): void;
        drawExecutionOrder(ctx: CanvasRenderingContext2D): void;
        /**
         * draws the widgets stored inside a node
         * @deprecated Use {@link LGraphNode.drawWidgets} instead.
         * @remarks Currently there are extensions hijacking this function, so we cannot remove it.
         */
        drawNodeWidgets(node: LGraphNode, _posY: null, ctx: CanvasRenderingContext2D): void;
        /**
         * draws every group area in the background
         */
        drawGroups(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void;
        /**
         * resizes the canvas to a given size, if no size is passed, then it tries to fill the parentNode
         * @todo Remove or rewrite
         */
        resize(width?: number, height?: number): void;
        onNodeSelectionChange(): void;
        /**
         * Determines the furthest nodes in each direction for the currently selected nodes
         */
        boundaryNodesForSelection(): NullableProperties<IBoundaryNodes>;
        showLinkMenu(segment: LinkSegment, e: CanvasPointerEvent): boolean;
        createDefaultNodeForSlot(optPass: ICreateDefaultNodeOptions): boolean;
        showConnectionMenu(optPass: Partial<ICreateNodeOptions & {
            e: MouseEvent;
        }>): ContextMenu<string> | undefined;
        prompt(title: string, value: any, callback: (arg0: any) => void, event: CanvasPointerEvent, multiline?: boolean): HTMLDivElement;
        showSearchBox(event: MouseEvent | null, searchOptions?: IShowSearchOptions): HTMLDivElement;
        showEditPropertyValue(node: LGraphNode, property: string, options: IDialogOptions): IDialog | undefined;
        createDialog(html: string, options: IDialogOptions): IDialog;
        createPanel(title: string, options: ICreatePanelOptions): any;
        closePanels(): void;
        showShowNodePanel(node: LGraphNode): void;
        checkPanels(): void;
        getCanvasMenuOptions(): (IContextMenuValue | null)[];
        getNodeMenuOptions(node: LGraphNode): (IContextMenuValue<INodeSlotContextItem, unknown, unknown> | IContextMenuValue<string, unknown, unknown> | IContextMenuValue<string | null, unknown, unknown> | IContextMenuValue<"round" | "default" | "box" | "card", unknown, unknown> | IContextMenuValue<unknown, LGraphNode, unknown> | null)[];
        /** @deprecated */
        getGroupMenuOptions(group: LGraphGroup): (IContextMenuValue<string, unknown, unknown> | IContextMenuValue<string | null, unknown, unknown> | null)[];
        processContextMenu(node: LGraphNode | undefined, event: CanvasPointerEvent): void;
        /**
         * Starts an animation to fit the view around the specified selection of nodes.
         * @param bounds The bounds to animate the view to, defined by a rectangle.
         */
        animateToBounds(bounds: ReadOnlyRect, options?: AnimationOptions): void;
        /**
         * Fits the view to the selected nodes with animation.
         * If nothing is selected, the view is fitted around all items in the graph.
         */
        fitViewToSelectionAnimated(options?: AnimationOptions): void;
        /**
         * Calculate new position with delta
         */
        private calculateNewPosition;
        /**
         * Apply batched node position updates
         */
        private applyNodePositionUpdates;
        /**
         * Initialize layout mutations with Canvas source
         */
        private initLayoutMutations;
        /**
         * Collect all nodes that are children of groups in the selection
         */
        private collectNodesInGroups;
        /**
         * Move group children (both nodes and non-nodes)
         */
        private moveGroupChildren;
        moveChildNodesInGroupVueMode(allItems: Set<Positionable>, deltaX: number, deltaY: number): void;
        repositionNodesVueMode(nodesToReposition: NewNodePosition[]): void;
    }

    export declare interface LGraphCanvasEventMap {
        /** The active graph has changed. */
        'litegraph:set-graph': {
            /** The new active graph. */
            newGraph: LGraph | Subgraph;
            /** The old active graph, or `null` if there was no active graph. */
            oldGraph: LGraph | Subgraph | null | undefined;
        };
        'subgraph-opened': {
            subgraph: Subgraph;
            closingGraph: LGraph;
            fromNode: SubgraphNode;
        };
        /** Dispatched after a group of items has been converted to a subgraph*/
        'subgraph-converted': {
            subgraphNode: SubgraphNode;
        };
        'litegraph:canvas': {
            subType: 'before-change' | 'after-change';
        } | {
            subType: 'empty-release';
            originalEvent?: CanvasPointerEvent;
            linkReleaseContext?: {
                links: ConnectingLink[];
            };
        } | {
            subType: 'group-double-click';
            originalEvent?: CanvasPointerEvent;
            group: LGraphGroup;
        } | {
            subType: 'empty-double-click';
            originalEvent?: CanvasPointerEvent;
        } | {
            subType: 'node-double-click';
            originalEvent?: CanvasPointerEvent;
            node: LGraphNode;
        };
        /** A title button on a node was clicked. */
        'litegraph:node-title-button-clicked': {
            node: LGraphNode;
            button: LGraphButton;
        };
    }

    /** @inheritdoc {@link LGraphCanvas.state} */
    export declare interface LGraphCanvasState {
        /** {@link Positionable} items are being dragged on the canvas. */
        draggingItems: boolean;
        /** The canvas itself is being dragged. */
        draggingCanvas: boolean;
        /** The canvas is read-only, preventing changes to nodes, disconnecting links, moving items, etc. */
        readOnly: boolean;
        /** Bit flags indicating what is currently below the pointer. */
        hoveringOver: CanvasItem;
        /** If `true`, pointer move events will set the canvas cursor style. */
        shouldSetCursor: boolean;
        /**
         * Dirty flag indicating that {@link selectedItems} has changed.
         * Downstream consumers may reset to false once actioned.
         */
        selectionChanged: boolean;
    }

    /** Configuration used by {@link LGraph} `config`. */
    export declare interface LGraphConfig {
        /** @deprecated Legacy config - unused */
        align_to_grid?: any;
        links_ontop?: any;
    }

    export declare interface LGraphEventMap {
        configuring: {
            /** The data that was used to configure the graph. */
            data: ISerialisedGraph | SerialisableGraph;
            /** If `true`, the graph will be cleared prior to adding the configuration. */
            clearGraph: boolean;
        };
        configured: never;
        'subgraph-created': {
            /** The subgraph that was created. */
            subgraph: Subgraph;
            /** The raw data that was used to create the subgraph. */
            data: ExportedSubgraph;
        };
        /** Dispatched when a group of items are converted to a subgraph. */
        'convert-to-subgraph': {
            /** The type of subgraph to create. */
            subgraph: Subgraph;
            /** The boundary around every item that was moved into the subgraph. */
            bounds: ReadOnlyRect;
            /** The raw data that was used to create the subgraph. */
            exportedSubgraph: ExportedSubgraph;
            /** The links that were used to create the subgraph. */
            boundaryLinks: LLink[];
            /** Links that go from outside the subgraph in, via an input on the subgraph node. */
            resolvedInputLinks: ResolvedConnection[];
            /** Links that go from inside the subgraph out, via an output on the subgraph node. */
            resolvedOutputLinks: ResolvedConnection[];
            /** The floating links that were used to create the subgraph. */
            boundaryFloatingLinks: LLink[];
            /** The internal links that were used to create the subgraph. */
            internalLinks: LLink[];
        };
        'open-subgraph': {
            subgraph: Subgraph;
            closingGraph: LGraph | Subgraph;
        };
    }

    export declare enum LGraphEventMode {
        ALWAYS = 0,
        ON_EVENT = 1,
        NEVER = 2,
        ON_TRIGGER = 3,
        BYPASS = 4
    }

    export declare interface LGraphExtra extends Dictionary<unknown> {
        reroutes?: SerialisableReroute[];
        linkExtensions?: {
            id: number;
            parentId: number | undefined;
        }[];
        ds?: DragAndScaleState;
        workflowRendererVersion?: RendererType;
    }

    export declare class LGraphGroup implements Positionable, IPinnable, IColorable {
        static minWidth: number;
        static minHeight: number;
        static resizeLength: number;
        static padding: number;
        static defaultColour: string;
        id: number;
        color?: string;
        title: string;
        font?: string;
        font_size: number;
        _bounding: Rectangle;
        _pos: Point;
        _size: Size;
        /** @deprecated See {@link _children} */
        _nodes: LGraphNode[];
        _children: Set<Positionable>;
        graph?: LGraph;
        flags: IGraphGroupFlags;
        selected?: boolean;
        constructor(title?: string, id?: number);
        /** @inheritdoc {@link IColorable.setColorOption} */
        setColorOption(colorOption: ColorOption | null): void;
        /** @inheritdoc {@link IColorable.getColorOption} */
        getColorOption(): ColorOption | null;
        /** Position of the group, as x,y co-ordinates in graph space */
        get pos(): Point;
        set pos(v: Point);
        /** Size of the group, as width,height in graph units */
        get size(): Size;
        set size(v: Size);
        get boundingRect(): Rectangle;
        getBounding(): Rectangle;
        get nodes(): LGraphNode[];
        get titleHeight(): number;
        get children(): ReadonlySet<Positionable>;
        get pinned(): boolean;
        /**
         * Prevents the group being accidentally moved or resized by mouse interaction.
         * Toggles pinned state if no value is provided.
         */
        pin(value?: boolean): void;
        unpin(): void;
        configure(o: ISerialisedGroup): void;
        serialize(): ISerialisedGroup;
        /**
         * Draws the group on the canvas
         * @param graphCanvas
         * @param ctx
         */
        draw(graphCanvas: LGraphCanvas, ctx: CanvasRenderingContext2D): void;
        resize(width: number, height: number): boolean;
        move(deltaX: number, deltaY: number, skipChildren?: boolean): void;
        /** @inheritdoc */
        snapToGrid(snapTo: number): boolean;
        recomputeInsideNodes(): void;
        /**
         * Resizes and moves the group to neatly fit all given {@link objects}.
         * @param objects All objects that should be inside the group
         * @param padding Value in graph units to add to all sides of the group.  Default: 10
         */
        resizeTo(objects: Iterable<Positionable>, padding?: number): void;
        /**
         * Add nodes to the group and adjust the group's position and size accordingly
         * @param nodes The nodes to add to the group
         * @param padding The padding around the group
         */
        addNodes(nodes: LGraphNode[], padding?: number): void;
        getMenuOptions(): (IContextMenuValue<string> | IContextMenuValue<string | null> | null)[];
        isPointInTitlebar(x: number, y: number): boolean;
        isInResize(x: number, y: number): boolean;
        isPointInside: (x: number, y: number) => boolean;
        setDirtyCanvas: (dirty_foreground: boolean, dirty_background?: boolean) => void;
    }

    export declare class LGraphIcon {
        unicode?: string;
        fontFamily: string;
        image?: HTMLImageElement;
        color: string;
        bgColor?: string;
        fontSize: number;
        size: number;
        circlePadding: number;
        xOffset: number;
        yOffset: number;
        constructor({ unicode, fontFamily, image, color, bgColor, fontSize, size, circlePadding, xOffset, yOffset }: LGraphIconOptions);
        draw(ctx: CanvasRenderingContext2D, x: number, y: number): void;
    }

    export declare interface LGraphIconOptions {
        unicode?: string;
        fontFamily?: string;
        image?: HTMLImageElement;
        color?: string;
        bgColor?: string;
        fontSize?: number;
        size?: number;
        circlePadding?: number;
        xOffset?: number;
        yOffset?: number;
    }

    export declare interface LGraphNode {
        constructor: LGraphNodeConstructor;
    }

    /**
     * Base class for all nodes
     * @param title a name for the node
     * @param type a type for the node
     */
    export declare class LGraphNode implements NodeLike, Positionable, IPinnable, IColorable {
        #private;
        static title?: string;
        static MAX_CONSOLE?: number;
        static type?: string;
        static category?: string;
        static description?: string;
        static filter?: string;
        static skip_list?: boolean;
        static resizeHandleSize: number;
        static resizeEdgeSize: number;
        /** Default setting for {@link LGraphNode.connectInputToOutput}. @see {@link INodeFlags.keepAllLinksOnBypass} */
        static keepAllLinksOnBypass: boolean;
        /** The title text of the node. */
        title: string;
        /**
         * The font style used to render the node's title text.
         */
        get titleFontStyle(): string;
        get innerFontStyle(): string;
        get displayType(): string;
        graph: LGraph | Subgraph | null;
        id: NodeId;
        type: string;
        inputs: INodeInputSlot[];
        outputs: INodeOutputSlot[];
        properties: Dictionary<NodeProperty | undefined>;
        properties_info: INodePropertyInfo[];
        flags: INodeFlags;
        widgets?: IBaseWidget[];
        /** Property manager for this node */
        changeTracker: LGraphNodeProperties;
        /**
         * The amount of space available for widgets to grow into.
         * @see {@link layoutWidgets}
         */
        freeWidgetSpace?: number;
        locked?: boolean;
        /** Execution order, automatically computed during run @see {@link LGraph.computeExecutionOrder} */
        order: number;
        mode: LGraphEventMode;
        last_serialization?: ISerialisedNode;
        serialize_widgets?: boolean;
        /**
         * The overridden fg color used to render the node.
         * @see {@link renderingColor}
         */
        color?: string;
        /**
         * The overridden bg color used to render the node.
         * @see {@link renderingBgColor}
         */
        bgcolor?: string;
        /**
         * The overridden box color used to render the node.
         * @see {@link renderingBoxColor}
         */
        boxcolor?: string;
        /** The fg color used to render the node. */
        get renderingColor(): string;
        /** The bg color used to render the node. */
        get renderingBgColor(): string;
        /** The box color used to render the node. */
        get renderingBoxColor(): string;
        /** @inheritdoc {@link IColorable.setColorOption} */
        setColorOption(colorOption: ColorOption | null): void;
        /** @inheritdoc {@link IColorable.getColorOption} */
        getColorOption(): ColorOption | null;
        /**
         * The stroke styles that should be applied to the node.
         */
        strokeStyles: Record<string, (this: LGraphNode) => IDrawBoundingOptions | undefined>;
        /**
         * The progress of node execution. Used to render a progress bar. Value between 0 and 1.
         */
        progress?: number;
        exec_version?: number;
        action_call?: string;
        execute_triggered?: number;
        action_triggered?: number;
        widgets_up?: boolean;
        widgets_start_y?: number;
        lostFocusAt?: number;
        gotFocusAt?: number;
        badges: (LGraphBadge | (() => LGraphBadge))[];
        title_buttons: LGraphButton[];
        badgePosition: BadgePosition;
        onOutputRemoved?(this: LGraphNode, slot: number): void;
        onInputRemoved?(this: LGraphNode, slot: number, input: INodeInputSlot): void;
        /**
         * The width of the node when collapsed.
         * Updated by {@link LGraphCanvas.drawNode}
         */
        _collapsed_width?: number;
        /**
         * Called once at the start of every frame.  Caller may change the values in {@link out}, which will be reflected in {@link boundingRect}.
         * WARNING: Making changes to boundingRect via onBounding is poorly supported, and will likely result in strange behaviour.
         */
        onBounding?(this: LGraphNode, out: Rect): void;
        console?: string[];
        _level?: number;
        _shape?: RenderShape;
        mouseOver?: IMouseOverData;
        redraw_on_mouse?: boolean;
        resizable?: boolean;
        clonable?: boolean;
        _relative_id?: number;
        clip_area?: boolean;
        ignore_remove?: boolean;
        has_errors?: boolean;
        removable?: boolean;
        block_delete?: boolean;
        selected?: boolean;
        showAdvanced?: boolean;
        comfyDynamic?: Record<string, object>;
        comfyClass?: string;
        isVirtualNode?: boolean;
        applyToGraph?(extraLinks?: LLink[]): void;
        isSubgraphNode(): this is SubgraphNode;
        /**
         * Rect describing the node area, including shadows and any protrusions.
         * Determines if the node is visible.  Calculated once at the start of every frame.
         */
        get renderArea(): ReadOnlyRect;
        /**
         * Cached node position & area as `x, y, width, height`.  Includes changes made by {@link onBounding}, if present.
         *
         * Determines the node hitbox and other rendering effects.  Calculated once at the start of every frame.
         */
        get boundingRect(): ReadOnlyRectangle;
        /** The offset from {@link pos} to the top-left of {@link boundingRect}. */
        get boundingOffset(): Readonly<Point>;
        /** {@link pos} and {@link size} values are backed by this {@link Rectangle}. */
        _posSize: Rectangle;
        _pos: Point;
        _size: Size;
        get pos(): Point;
        /** Node position does not necessarily correlate to the top-left corner. */
        set pos(value: Point);
        get size(): Size;
        set size(value: Size);
        /**
         * The size of the node used for rendering.
         */
        get renderingSize(): Size;
        get shape(): RenderShape | undefined;
        set shape(v: RenderShape | 'default' | 'box' | 'round' | 'circle' | 'card');
        /**
         * The shape of the node used for rendering. @see {@link RenderShape}
         */
        get renderingShape(): RenderShape;
        get is_selected(): boolean | undefined;
        set is_selected(value: boolean);
        get title_mode(): TitleMode;
        onConnectInput?(this: LGraphNode, target_slot: number, type: unknown, output: INodeOutputSlot | SubgraphIO, node: LGraphNode | SubgraphInputNode, slot: number): boolean;
        onConnectOutput?(this: LGraphNode, slot: number, type: unknown, input: INodeInputSlot | SubgraphIO, target_node: number | LGraphNode | SubgraphOutputNode, target_slot: number): boolean;
        onResize?(this: LGraphNode, size: Size): void;
        onPropertyChanged?(this: LGraphNode, name: string, value: unknown, prev_value?: unknown): boolean;
        /** Called for each connection that is created, updated, or removed. This includes "restored" connections when deserialising. */
        onConnectionsChange?(this: LGraphNode, type: ISlotType, index: number, isConnected: boolean, link_info: LLink | null | undefined, inputOrOutput: INodeInputSlot | INodeOutputSlot | SubgraphIO): void;
        onInputAdded?(this: LGraphNode, input: INodeInputSlot): void;
        onOutputAdded?(this: LGraphNode, output: INodeOutputSlot): void;
        onConfigure?(this: LGraphNode, serialisedNode: ISerialisedNode): void;
        onSerialize?(this: LGraphNode, serialised: ISerialisedNode): any;
        onExecute?(this: LGraphNode, param?: unknown, options?: {
            action_call?: any;
        }): void;
        onAction?(this: LGraphNode, action: string, param: unknown, options: {
            action_call?: string;
        }): void;
        onDrawBackground?(this: LGraphNode, ctx: CanvasRenderingContext2D): void;
        onNodeCreated?(this: LGraphNode): void;
        /**
         * Callback invoked by {@link connect} to override the target slot index.
         * Its return value overrides the target index selection.
         * @param target_slot The current input slot index
         * @param requested_slot The originally requested slot index - could be negative, or if using (deprecated) name search, a string
         * @returns {number | null} If a number is returned, the connection will be made to that input index.
         * If an invalid index or non-number (false, null, NaN etc) is returned, the connection will be cancelled.
         */
        onBeforeConnectInput?(this: LGraphNode, target_slot: number, requested_slot?: number | string): number | false | null;
        onShowCustomPanelInfo?(this: LGraphNode, panel: any): void;
        onAddPropertyToPanel?(this: LGraphNode, pName: string, panel: any): boolean;
        onWidgetChanged?(this: LGraphNode, name: string, value: unknown, old_value: unknown, w: IBaseWidget): void;
        onDeselected?(this: LGraphNode): void;
        onKeyUp?(this: LGraphNode, e: KeyboardEvent): void;
        onKeyDown?(this: LGraphNode, e: KeyboardEvent): void;
        onSelected?(this: LGraphNode): void;
        getExtraMenuOptions?(this: LGraphNode, canvas: LGraphCanvas, options: (IContextMenuValue<unknown> | null)[]): (IContextMenuValue<unknown> | null)[];
        getMenuOptions?(this: LGraphNode, canvas: LGraphCanvas): IContextMenuValue[];
        onAdded?(this: LGraphNode, graph: LGraph): void;
        onDrawCollapsed?(this: LGraphNode, ctx: CanvasRenderingContext2D, cavnas: LGraphCanvas): boolean;
        onDrawForeground?(this: LGraphNode, ctx: CanvasRenderingContext2D, canvas: LGraphCanvas, canvasElement: HTMLCanvasElement): void;
        onMouseLeave?(this: LGraphNode, e: CanvasPointerEvent): void;
        /**
         * Override the default slot menu options.
         */
        getSlotMenuOptions?(this: LGraphNode, slot: IFoundSlot): IContextMenuValue[];
        /**
         * Add extra menu options to the slot context menu.
         */
        getExtraSlotMenuOptions?(this: LGraphNode, slot: IFoundSlot): IContextMenuValue[];
        onDropItem?(this: LGraphNode, event: Event): boolean;
        onDropData?(this: LGraphNode, data: string | ArrayBuffer, filename: any, file: any): void;
        onDropFile?(this: LGraphNode, file: any): void;
        onInputClick?(this: LGraphNode, index: number, e: CanvasPointerEvent): void;
        onInputDblClick?(this: LGraphNode, index: number, e: CanvasPointerEvent): void;
        onOutputClick?(this: LGraphNode, index: number, e: CanvasPointerEvent): void;
        onOutputDblClick?(this: LGraphNode, index: number, e: CanvasPointerEvent): void;
        onGetPropertyInfo?(this: LGraphNode, property: string): any;
        onNodeOutputAdd?(this: LGraphNode, value: unknown): void;
        onNodeInputAdd?(this: LGraphNode, value: unknown): void;
        onMenuNodeInputs?(this: LGraphNode, entries: (IContextMenuValue<INodeSlotContextItem> | null)[]): (IContextMenuValue<INodeSlotContextItem> | null)[];
        onMenuNodeOutputs?(this: LGraphNode, entries: (IContextMenuValue<INodeSlotContextItem> | null)[]): (IContextMenuValue<INodeSlotContextItem> | null)[];
        onMouseUp?(this: LGraphNode, e: CanvasPointerEvent, pos: Point): void;
        onMouseEnter?(this: LGraphNode, e: CanvasPointerEvent): void;
        /** Blocks drag if return value is truthy. @param pos Offset from {@link LGraphNode.pos}. */
        onMouseDown?(this: LGraphNode, e: CanvasPointerEvent, pos: Point, canvas: LGraphCanvas): boolean;
        /** @param pos Offset from {@link LGraphNode.pos}. */
        onDblClick?(this: LGraphNode, e: CanvasPointerEvent, pos: Point, canvas: LGraphCanvas): void;
        /** @param pos Offset from {@link LGraphNode.pos}. */
        onNodeTitleDblClick?(this: LGraphNode, e: CanvasPointerEvent, pos: Point, canvas: LGraphCanvas): void;
        onDrawTitle?(this: LGraphNode, ctx: CanvasRenderingContext2D): void;
        onDrawTitleText?(this: LGraphNode, ctx: CanvasRenderingContext2D, title_height: number, size: Size, scale: number, title_text_font: string, selected?: boolean): void;
        onDrawTitleBox?(this: LGraphNode, ctx: CanvasRenderingContext2D, title_height: number, size: Size, scale: number): void;
        onDrawTitleBar?(this: LGraphNode, ctx: CanvasRenderingContext2D, title_height: number, size: Size, scale: number, fgcolor: any): void;
        onRemoved?(this: LGraphNode): void;
        onMouseMove?(this: LGraphNode, e: CanvasPointerEvent, pos: Point, arg2: LGraphCanvas): void;
        onPropertyChange?(this: LGraphNode): void;
        updateOutputData?(this: LGraphNode, origin_slot: number): void;
        constructor(title: string, type?: string);
        /** Internal callback for subgraph nodes. Do not implement externally. */
        _internalConfigureAfterSlots?(): void;
        /**
         * configure a node from an object containing the serialized info
         */
        configure(info: ISerialisedNode): void;
        /**
         * serialize the content
         */
        serialize(): ISerialisedNode;
        clone(): LGraphNode | null;
        /**
         * serialize and stringify
         */
        toString(): string;
        /**
         * get the title string
         */
        getTitle(): string;
        /**
         * sets the value of a property
         * @param name
         * @param value
         */
        setProperty(name: string, value: TWidgetValue): void;
        /**
         * sets the output data
         * @param slot
         * @param data
         */
        setOutputData(slot: number, data: number | string | boolean | {
            toToolTip?(): string;
        }): void;
        /**
         * sets the output data type, useful when you want to be able to overwrite the data type
         */
        setOutputDataType(slot: number, type: ISlotType): void;
        /**
         * Retrieves the input data (data traveling through the connection) from one slot
         * @param slot
         * @param force_update if set to true it will force the connected node of this slot to output data into this link
         * @returns data or if it is not connected returns undefined
         */
        getInputData(slot: number, force_update?: boolean): unknown;
        /**
         * Retrieves the input data type (in case this supports multiple input types)
         * @param slot
         * @returns datatype in string format
         */
        getInputDataType(slot: number): ISlotType | null;
        /**
         * Retrieves the input data from one slot using its name instead of slot number
         * @param slot_name
         * @param force_update if set to true it will force the connected node of this slot to output data into this link
         * @returns data or if it is not connected returns null
         */
        getInputDataByName(slot_name: string, force_update: boolean): unknown;
        /**
         * tells you if there is a connection in one input slot
         * @param slot The 0-based index of the input to check
         * @returns `true` if the input slot has a link ID (does not perform validation)
         */
        isInputConnected(slot: number): boolean;
        /**
         * tells you info about an input connection (which node, type, etc)
         * @returns object or null { link: id, name: string, type: string or 0 }
         */
        getInputInfo(slot: number): INodeInputSlot | null;
        /**
         * Returns the link info in the connection of an input slot
         * @returns object or null
         */
        getInputLink(slot: number): LLink | null;
        /**
         * returns the node connected in the input slot
         * @returns node or null
         */
        getInputNode(slot: number): LGraphNode | null;
        /**
         * returns the value of an input with this name, otherwise checks if there is a property with that name
         * @returns value
         */
        getInputOrProperty(name: string): unknown;
        /**
         * tells you the last output data that went in that slot
         * @returns object or null
         */
        getOutputData(slot: number): unknown;
        /**
         * tells you info about an output connection (which node, type, etc)
         * @returns object or null { name: string, type: string, links: [ ids of links in number ] }
         */
        getOutputInfo(slot: number): INodeOutputSlot | null;
        /**
         * tells you if there is a connection in one output slot
         */
        isOutputConnected(slot: number): boolean;
        /**
         * tells you if there is any connection in the output slots
         */
        isAnyOutputConnected(): boolean;
        /**
         * retrieves all the nodes connected to this output slot
         */
        getOutputNodes(slot: number): LGraphNode[] | null;
        addOnTriggerInput(): number;
        addOnExecutedOutput(): number;
        onAfterExecuteNode(param: unknown, options?: {
            action_call?: any;
        }): void;
        changeMode(modeTo: number): boolean;
        /**
         * Triggers the node code execution, place a boolean/counter to mark the node as being executed
         */
        doExecute(param?: unknown, options?: {
            action_call?: any;
        }): void;
        /**
         * Triggers an action, wrapped by logics to control execution flow
         * @param action name
         */
        actionDo(action: string, param: unknown, options: {
            action_call?: string;
        }): void;
        /**
         * Triggers an event in this node, this will trigger any output with the same name
         * @param action name ( "on_play", ... ) if action is equivalent to false then the event is send to all
         */
        trigger(action: string, param: unknown, options: {
            action_call?: any;
        }): void;
        /**
         * Triggers a slot event in this node: cycle output slots and launch execute/action on connected nodes
         * @param slot the index of the output slot
         * @param link_id [optional] in case you want to trigger and specific output link in a slot
         */
        triggerSlot(slot: number, param: unknown, link_id: number | null, options?: {
            action_call?: any;
        }): void;
        /**
         * clears the trigger slot animation
         * @param slot the index of the output slot
         * @param link_id [optional] in case you want to trigger and specific output link in a slot
         */
        clearTriggeredSlot(slot: number, link_id: number): void;
        /**
         * changes node size and triggers callback
         */
        setSize(size: Size): void;
        /**
         * Expands the node size to fit its content.
         */
        expandToFitContent(): void;
        /**
         * add a new property to this node
         * @param type string defining the output type ("vec3","number",...)
         * @param extra_info this can be used to have special properties of the property (like values, etc)
         */
        addProperty(name: string, default_value: NodeProperty | undefined, type?: string, extra_info?: Partial<INodePropertyInfo>): INodePropertyInfo;
        /**
         * add a new output slot to use in this node
         * @param type string defining the output type ("vec3","number",...)
         * @param extra_info this can be used to have special properties of an output (label, special color, position, etc)
         */
        addOutput<TProperties extends Partial<INodeOutputSlot>>(name: string, type: ISlotType, extra_info?: TProperties): INodeOutputSlot & TProperties;
        /**
         * remove an existing output slot
         */
        removeOutput(slot: number): void;
        /**
         * add a new input slot to use in this node
         * @param type string defining the input type ("vec3","number",...), it its a generic one use 0
         * @param extra_info this can be used to have special properties of an input (label, color, position, etc)
         */
        addInput<TProperties extends Partial<INodeInputSlot>>(name: string, type: ISlotType, extra_info?: TProperties): INodeInputSlot & TProperties;
        /**
         * remove an existing input slot
         */
        removeInput(slot: number): void;
        /**
         * computes the minimum size of a node according to its inputs and output slots
         * @returns the total size
         */
        computeSize(out?: Size): Size;
        inResizeCorner(canvasX: number, canvasY: number): boolean;
        /**
         * Returns which resize corner the point is over, if any.
         * @param canvasX X position in canvas coordinates
         * @param canvasY Y position in canvas coordinates
         * @returns The compass corner the point is in, otherwise `undefined`.
         */
        findResizeDirection(canvasX: number, canvasY: number): CompassCorners | undefined;
        /**
         * returns all the info available about a property of this node.
         * @param property name of the property
         * @returns the object with all the available info
         */
        getPropertyInfo(property: string): any;
        /**
         * Defines a widget inside the node, it will be rendered on top of the node, you can control lots of properties
         * @param type the widget type
         * @param name the text to show on the widget
         * @param value the default value
         * @param callback function to call when it changes (optionally, it can be the name of the property to modify)
         * @param options the object that contains special properties of this widget
         * @returns the created widget object
         */
        addWidget<Type extends TWidgetType, TValue extends WidgetTypeMap[Type]['value']>(type: Type, name: string, value: TValue, callback: IBaseWidget['callback'] | string | null, options?: IWidgetOptions | string): WidgetTypeMap[Type] | IBaseWidget;
        addCustomWidget<TPlainWidget extends IBaseWidget>(custom_widget: TPlainWidget): TPlainWidget | WidgetTypeMap[TPlainWidget['type']];
        addTitleButton(options: LGraphButtonOptions): LGraphButton;
        onTitleButtonClick(button: LGraphButton, canvas: LGraphCanvas): void;
        removeWidgetByName(name: string): void;
        removeWidget(widget: IBaseWidget): void;
        ensureWidgetRemoved(widget: IBaseWidget): void;
        move(deltaX: number, deltaY: number): void;
        /**
         * Internal method to measure the node for rendering.  Prefer {@link boundingRect} where possible.
         *
         * Populates {@link out} with the results in graph space.
         * Populates {@link _collapsed_width} with the collapsed width if the node is collapsed.
         * Adjusts for title and collapsed status, but does not call {@link onBounding}.
         * @param out `x, y, width, height` are written to this array.
         * @param ctx The canvas context to use for measuring text.
         */
        measure(out: Rect, ctx?: CanvasRenderingContext2D): void;
        /**
         * returns the bounding of the object, used for rendering purposes
         * @param out {Rect?} [optional] a place to store the output, to free garbage
         * @param includeExternal {boolean?} [optional] set to true to
         * include the shadow and connection points in the bounding calculation
         * @returns the bounding box in format of [topleft_cornerx, topleft_cornery, width, height]
         */
        getBounding(out?: Rect, includeExternal?: boolean): Rect;
        /**
         * Calculates the render area of this node, populating both {@link boundingRect} and {@link renderArea}.
         * Called automatically at the start of every frame.
         */
        updateArea(ctx?: CanvasRenderingContext2D): void;
        /**
         * checks if a point is inside the shape of a node
         */
        isPointInside(x: number, y: number): boolean;
        /**
         * Checks if the provided point is inside this node's collapse button area.
         * @param x X co-ordinate to check
         * @param y Y co-ordinate to check
         * @returns true if the x,y point is in the collapse button area, otherwise false
         */
        isPointInCollapse(x: number, y: number): boolean;
        /**
         * Returns the input slot at the given position. Uses full 20 height, and approximates the label length.
         * @param pos The graph co-ordinates to check
         * @returns The input slot at the given position if found, otherwise `undefined`.
         */
        getInputOnPos(pos: Point): INodeInputSlot | undefined;
        /**
         * Returns the output slot at the given position. Uses full 20x20 box for the slot.
         * @param pos The graph co-ordinates to check
         * @returns The output slot at the given position if found, otherwise `undefined`.
         */
        getOutputOnPos(pos: Point): INodeOutputSlot | undefined;
        /**
         * Returns the input or output slot at the given position.
         *
         * Tries {@link getNodeInputOnPos} first, then {@link getNodeOutputOnPos}.
         * @param pos The graph co-ordinates to check
         * @returns The input or output slot at the given position if found, otherwise `undefined`.
         */
        getSlotOnPos(pos: Point): INodeInputSlot | INodeOutputSlot | undefined;
        /**
         * @deprecated Use {@link getSlotOnPos} instead.
         * checks if a point is inside a node slot, and returns info about which slot
         * @param x
         * @param y
         * @returns if found the object contains { input|output: slot object, slot: number, link_pos: [x,y] }
         */
        getSlotInPosition(x: number, y: number): IFoundSlot | null;
        /**
         * Gets the widget on this node at the given co-ordinates.
         * @param canvasX X co-ordinate in graph space
         * @param canvasY Y co-ordinate in graph space
         * @returns The widget found, otherwise `null`
         */
        getWidgetOnPos(canvasX: number, canvasY: number, includeDisabled?: boolean): IBaseWidget | undefined;
        /**
         * Returns the input slot with a given name (used for dynamic slots), -1 if not found
         * @param name the name of the slot to find
         * @param returnObj if the obj itself wanted
         * @returns the slot (-1 if not found)
         */
        findInputSlot<TReturn extends false>(name: string, returnObj?: TReturn): number;
        findInputSlot<TReturn extends true>(name: string, returnObj?: TReturn): INodeInputSlot;
        /**
         * returns the output slot with a given name (used for dynamic slots), -1 if not found
         * @param name the name of the slot to find
         * @param returnObj if the obj itself wanted
         * @returns the slot (-1 if not found)
         */
        findOutputSlot<TReturn extends false>(name: string, returnObj?: TReturn): number;
        findOutputSlot<TReturn extends true>(name: string, returnObj?: TReturn): INodeOutputSlot;
        /**
         * Finds the first free input slot.
         * @param optsIn
         * @returns The index of the first matching slot, the slot itself if returnObj is true, or -1 if not found.
         */
        findInputSlotFree<TReturn extends false>(optsIn?: FindFreeSlotOptions & {
            returnObj?: TReturn;
        }): number;
        findInputSlotFree<TReturn extends true>(optsIn?: FindFreeSlotOptions & {
            returnObj?: TReturn;
        }): INodeInputSlot | -1;
        /**
         * Finds the first free output slot.
         * @param optsIn
         * @returns The index of the first matching slot, the slot itself if returnObj is true, or -1 if not found.
         */
        findOutputSlotFree<TReturn extends false>(optsIn?: FindFreeSlotOptions & {
            returnObj?: TReturn;
        }): number;
        findOutputSlotFree<TReturn extends true>(optsIn?: FindFreeSlotOptions & {
            returnObj?: TReturn;
        }): INodeOutputSlot | -1;
        /**
         * findSlotByType for INPUTS
         */
        findInputSlotByType<TReturn extends false>(type: ISlotType, returnObj?: TReturn, preferFreeSlot?: boolean, doNotUseOccupied?: boolean): number;
        findInputSlotByType<TReturn extends true>(type: ISlotType, returnObj?: TReturn, preferFreeSlot?: boolean, doNotUseOccupied?: boolean): INodeInputSlot;
        /**
         * findSlotByType for OUTPUTS
         */
        findOutputSlotByType<TReturn extends false>(type: ISlotType, returnObj?: TReturn, preferFreeSlot?: boolean, doNotUseOccupied?: boolean): number;
        findOutputSlotByType<TReturn extends true>(type: ISlotType, returnObj?: TReturn, preferFreeSlot?: boolean, doNotUseOccupied?: boolean): INodeOutputSlot;
        /**
         * returns the output (or input) slot with a given type, -1 if not found
         * @param input use inputs instead of outputs
         * @param type the type of the slot to find
         * @param returnObj if the obj itself wanted
         * @param preferFreeSlot if we want a free slot (if not found, will return the first of the type anyway)
         * @returns the slot (-1 if not found)
         */
        findSlotByType<TSlot extends true | false, TReturn extends false>(input: TSlot, type: ISlotType, returnObj?: TReturn, preferFreeSlot?: boolean, doNotUseOccupied?: boolean): number;
        findSlotByType<TSlot extends true, TReturn extends true>(input: TSlot, type: ISlotType, returnObj?: TReturn, preferFreeSlot?: boolean, doNotUseOccupied?: boolean): INodeInputSlot | -1;
        findSlotByType<TSlot extends false, TReturn extends true>(input: TSlot, type: ISlotType, returnObj?: TReturn, preferFreeSlot?: boolean, doNotUseOccupied?: boolean): INodeOutputSlot | -1;
        /**
         * Determines the slot index to connect to when attempting to connect by type.
         * @param findInputs If true, searches for an input.  Otherwise, an output.
         * @param node The node at the other end of the connection.
         * @param slotType The type of slot at the other end of the connection.
         * @param options Search restrictions to adhere to.
         * @see {connectByType}
         * @see {connectByTypeOutput}
         */
        findConnectByTypeSlot(findInputs: boolean, node: LGraphNode, slotType: ISlotType, options?: ConnectByTypeOptions): number | undefined;
        /**
         * Finds the first free output slot with any of the comma-delimited types in {@link type}.
         *
         * If no slots are free, falls back in order to:
         * - The first free wildcard slot
         * - The first occupied slot
         * - The first occupied wildcard slot
         * @param type The {@link ISlotType type} of slot to find
         * @returns The index and slot if found, otherwise `undefined`.
         */
        findOutputByType(type: ISlotType): {
            index: number;
            slot: INodeOutputSlot;
        } | undefined;
        /**
         * Finds the first free input slot with any of the comma-delimited types in {@link type}.
         *
         * If no slots are free, falls back in order to:
         * - The first free wildcard slot
         * - The first occupied slot
         * - The first occupied wildcard slot
         * @param type The {@link ISlotType type} of slot to find
         * @returns The index and slot if found, otherwise `undefined`.
         */
        findInputByType(type: ISlotType): {
            index: number;
            slot: INodeInputSlot;
        } | undefined;
        /**
         * connect this node output to the input of another node BY TYPE
         * @param slot (could be the number of the slot or the string with the name of the slot)
         * @param target_node the target node
         * @param target_slotType the input slot type of the target node
         * @returns the link_info is created, otherwise null
         */
        connectByType(slot: number | string, target_node: LGraphNode, target_slotType: ISlotType, optsIn?: ConnectByTypeOptions): LLink | null;
        /**
         * connect this node input to the output of another node BY TYPE
         * @param slot (could be the number of the slot or the string with the name of the slot)
         * @param source_node the target node
         * @param source_slotType the output slot type of the target node
         * @returns the link_info is created, otherwise null
         */
        connectByTypeOutput(slot: number | string, source_node: LGraphNode, source_slotType: ISlotType, optsIn?: ConnectByTypeOptions): LLink | null;
        canConnectTo(node: NodeLike, toSlot: INodeInputSlot | SubgraphIO, fromSlot: INodeOutputSlot | SubgraphIO): boolean;
        /**
         * Connect an output of this node to an input of another node
         * @param slot (could be the number of the slot or the string with the name of the slot)
         * @param target_node the target node
         * @param target_slot the input slot of the target node (could be the number of the slot or the string with the name of the slot, or -1 to connect a trigger)
         * @returns the link_info is created, otherwise null
         */
        connect(slot: number | string, target_node: LGraphNode, target_slot: ISlotType, afterRerouteId?: RerouteId): LLink | null;
        /**
         * Connect two slots between two nodes
         * @param output The output slot to connect
         * @param inputNode The node that the input slot is on
         * @param input The input slot to connect
         * @param afterRerouteId The reroute ID to use for the link
         * @returns The link that was created, or null if the connection was blocked
         */
        connectSlots(output: INodeOutputSlot, inputNode: LGraphNode, input: INodeInputSlot, afterRerouteId: RerouteId | undefined): LLink | null | undefined;
        connectFloatingReroute(pos: Point, slot: INodeInputSlot | INodeOutputSlot, afterRerouteId?: RerouteId): Reroute;
        /**
         * disconnect one output to an specific node
         * @param slot (could be the number of the slot or the string with the name of the slot)
         * @param target_node the target node to which this slot is connected [Optional,
         * if not target_node is specified all nodes will be disconnected]
         * @returns if it was disconnected successfully
         */
        disconnectOutput(slot: string | number, target_node?: LGraphNode): boolean;
        /**
         * Disconnect one input
         * @param slot Input slot index, or the name of the slot
         * @param keepReroutes If `true`, reroutes will not be garbage collected.
         * @returns true if disconnected successfully or already disconnected, otherwise false
         */
        disconnectInput(slot: number | string, keepReroutes?: boolean): boolean;
        /**
         * @deprecated Use {@link getInputPos} or {@link getOutputPos} instead.
         * returns the center of a connection point in canvas coords
         * @param is_input true if if a input slot, false if it is an output
         * @param slot_number (could be the number of the slot or the string with the name of the slot)
         * @param out [optional] a place to store the output, to free garbage
         * @returns the position
         */
        getConnectionPos(is_input: boolean, slot_number: number, out?: Point): Point;
        /**
         * Gets the position of an input slot, in graph co-ordinates.
         *
         * This method is preferred over the legacy {@link getConnectionPos} method.
         * @param slot Input slot index
         * @returns Position of the input slot
         */
        getInputPos(slot: number): Point;
        /**
         * Gets the position of an input slot, in graph co-ordinates.
         * @param input The actual node input object
         * @returns Position of the centre of the input slot in graph co-ordinates.
         */
        getInputSlotPos(input: INodeInputSlot): Point;
        /**
         * Gets the position of an output slot, in graph co-ordinates.
         *
         * This method is preferred over the legacy {@link getConnectionPos} method.
         * @param outputSlotIndex Output slot index
         * @returns Position of the output slot
         */
        getOutputPos(outputSlotIndex: number): Point;
        /**
         * Get slot position using layout tree if available, fallback to node's position * Unified implementation used by both LitegraphLinkAdapter and useLinkLayoutSync
         * @param slotIndex The slot index
         * @param isInput Whether this is an input slot
         * @returns Position of the slot center in graph coordinates
         */
        getSlotPosition(slotIndex: number, isInput: boolean): Point;
        /** @inheritdoc */
        snapToGrid(snapTo: number): boolean;
        /** @see {@link snapToGrid} */
        alignToGrid(): void;
        trace(msg: string): void;
        setDirtyCanvas(dirty_foreground: boolean, dirty_background?: boolean): void;
        loadImage(url: string): HTMLImageElement;
        /**
         * Allows to get onMouseMove and onMouseUp events even if the mouse is out of focus
         * @deprecated Use {@link LGraphCanvas.pointer} instead.
         */
        captureInput(v: boolean): void;
        get collapsed(): boolean;
        get collapsible(): boolean;
        /**
         * Toggle node collapse (makes it smaller on the canvas)
         */
        collapse(force?: boolean): void;
        /**
         * Toggles advanced mode of the node, showing advanced widgets
         */
        toggleAdvanced(): void;
        get pinned(): boolean;
        /**
         * Prevents the node being accidentally moved or resized by mouse interaction.
         * Toggles pinned state if no value is provided.
         */
        pin(v?: boolean): void;
        unpin(): void;
        localToScreen(x: number, y: number, dragAndScale: DragAndScale): Point;
        get width(): number;
        /**
         * Returns the height of the node, including the title bar.
         */
        get height(): number;
        /**
         * Returns the height of the node, excluding the title bar.
         */
        get bodyHeight(): number;
        drawBadges(ctx: CanvasRenderingContext2D, { gap }?: {
            gap?: number | undefined;
        }): void;
        /**
         * Renders the node's title bar background
         */
        drawTitleBarBackground(ctx: CanvasRenderingContext2D, { scale, title_height, low_quality }: DrawTitleOptions): void;
        /**
         * Renders the node's title box, i.e. the dot in front of the title text that
         * when clicked toggles the node's collapsed state. The term `title box` comes
         * from the original LiteGraph implementation.
         */
        drawTitleBox(ctx: CanvasRenderingContext2D, { scale, low_quality, title_height, box_size }: DrawTitleBoxOptions): void;
        /**
         * Renders the node's title text.
         */
        drawTitleText(ctx: CanvasRenderingContext2D, { scale, default_title_color, low_quality, title_height }: DrawTitleTextOptions): void;
        /**
         * Attempts to gracefully bypass this node in all of its connections by reconnecting all links.
         *
         * Each input is checked against each output.  This is done on a matching index basis, i.e. input 3 -> output 3.
         * If there are any input links remaining,
         * and {@link flags}.{@link INodeFlags.keepAllLinksOnBypass keepAllLinksOnBypass} is `true`,
         * each input will check for outputs that match, and take the first one that matches
         * `true`: Try the index matching first, then every input to every output.
         * `false`: Only matches indexes, e.g. input 3 to output 3.
         *
         * If {@link flags}.{@link INodeFlags.keepAllLinksOnBypass keepAllLinksOnBypass} is `undefined`, it will fall back to
         * the static {@link keepAllLinksOnBypass}.
         * @returns `true` if any new links were established, otherwise `false`.
         * @todo Decision: Change API to return array of new links instead?
         */
        connectInputToOutput(): boolean | undefined;
        /**
         * Returns `true` if the widget is visible, otherwise `false`.
         */
        isWidgetVisible(widget: IBaseWidget): boolean;
        updateComputedDisabled(): void;
        drawWidgets(ctx: CanvasRenderingContext2D, { lowQuality, editorAlpha }: DrawWidgetsOptions): void;
        /**
         * When {@link LGraphNode.collapsed} is `true`, this method draws the node's collapsed slots.
         */
        drawCollapsedSlots(ctx: CanvasRenderingContext2D): void;
        get slots(): (INodeInputSlot | INodeOutputSlot)[];
        /**
         * Returns the input slot that is associated with the given widget.
         */
        getSlotFromWidget(widget: IBaseWidget | undefined): INodeInputSlot | undefined;
        /**
         * Returns the widget that is associated with the given input slot.
         */
        getWidgetFromSlot(slot: INodeInputSlot): IBaseWidget | undefined;
        /**
         * Draws the node's input and output slots.
         */
        drawSlots(ctx: CanvasRenderingContext2D, { fromSlot, colorContext, editorAlpha, lowQuality }: DrawSlotsOptions): void;
        /* Excluded from this release type: _setConcreteSlots */
        /**
         * Arranges node elements in preparation for rendering (slots & widgets).
         */
        arrange(): void;
        /**
         * Draws a progress bar on the node.
         * @param ctx The canvas context to draw on
         */
        drawProgressBar(ctx: CanvasRenderingContext2D): void;
    }

    export declare interface LGraphNodeConstructor<T extends LGraphNode = LGraphNode> {
        new (title: string, type?: string): T;
        title: string;
        type?: string;
        size?: Size;
        min_height?: number;
        slot_start_y?: number;
        widgets_info?: any;
        collapsable?: boolean;
        color?: string;
        bgcolor?: string;
        shape?: RenderShape;
        title_mode?: TitleMode;
        title_color?: string;
        title_text_color?: string;
        keepAllLinksOnBypass: boolean;
        resizeHandleSize?: number;
        resizeEdgeSize?: number;
    }

    /**
     * Manages node properties with optional change tracking and instrumentation.
     */
    export declare class LGraphNodeProperties {
        #private;
        /** The node this property manager belongs to */
        node: LGraphNode;
        constructor(node: LGraphNode);
        /**
         * Checks if a property is being tracked
         */
        isTracked(path: string): boolean;
        /**
         * Gets the list of tracked properties
         */
        getTrackedProperties(): string[];
        /**
         * Custom toJSON method for JSON.stringify
         * Returns undefined to exclude from serialization since we only use defaults
         */
        toJSON(): any;
    }

    export declare interface LGraphState {
        lastGroupId: number;
        lastNodeId: number;
        lastLinkId: number;
        lastRerouteId: number;
    }

    export declare type LGraphTriggerAction = LGraphTriggerEvent['type'];

    export declare type LGraphTriggerEvent = NodePropertyChangedEvent | NodeSlotErrorsChangedEvent | NodeSlotLinksChangedEvent;

    export declare type LGraphTriggerHandler = (event: LGraphTriggerEvent) => void;

    export declare type LGraphTriggerParam<A extends LGraphTriggerAction> = Extract<LGraphTriggerEvent, {
        type: A;
    }>;

    /**
     * Component of {@link LGraphCanvas} that handles connecting and moving links.
     * @see {@link LLink}
     */
    export declare class LinkConnector {
        #private;
        /**
         * Link connection state POJO. Source of truth for state of link drag operations.
         *
         * Can be replaced or proxied to allow notifications.
         * Is always dereferenced at the start of an operation.
         */
        state: LinkConnectorState;
        readonly events: CustomEventTarget<LinkConnectorEventMap, "reset" | "before-drop-links" | "after-drop-links" | "before-move-input" | "before-move-output" | "input-moved" | "output-moved" | "link-created" | "dropped-on-reroute" | "dropped-on-node" | "dropped-on-io-node" | "dropped-on-canvas" | "dropped-on-widget">;
        /** Contains information for rendering purposes only. */
        readonly renderLinks: RenderLinkUnion[];
        /** Existing links that are being moved **to** a new input slot. */
        readonly inputLinks: LLink[];
        /** Existing links that are being moved **to** a new output slot. */
        readonly outputLinks: LLink[];
        /** Existing floating links that are being moved to a new slot. */
        readonly floatingLinks: LLink[];
        readonly hiddenReroutes: Set<Reroute>;
        /** The widget beneath the pointer, if it is a valid connection target. */
        overWidget?: IBaseWidget;
        /** The type (returned by downstream callback) for {@link overWidget} */
        overWidgetType?: string;
        /** The reroute beneath the pointer, if it is a valid connection target. */
        overReroute?: Reroute;
        constructor(setConnectingLinks: (value: ConnectingLink[]) => void);
        get isConnecting(): boolean;
        get draggingExistingLinks(): boolean;
        /** Drag an existing link to a different input. */
        moveInputLink(network: LinkNetwork, input: INodeInputSlot): void;
        /** Drag all links from an output to a new output. */
        moveOutputLink(network: LinkNetwork, output: INodeOutputSlot): void;
        /**
         * Drags a new link from an output slot to an input slot.
         * @param network The network that the link being connected belongs to
         * @param node The node the link is being dragged from
         * @param output The output slot that the link is being dragged from
         */
        dragNewFromOutput(network: LinkNetwork, node: LGraphNode, output: INodeOutputSlot, fromReroute?: Reroute): void;
        /**
         * Drags a new link from an input slot to an output slot.
         * @param network The network that the link being connected belongs to
         * @param node The node the link is being dragged from
         * @param input The input slot that the link is being dragged from
         */
        dragNewFromInput(network: LinkNetwork, node: LGraphNode, input: INodeInputSlot, fromReroute?: Reroute): void;
        dragNewFromSubgraphInput(network: LinkNetwork, inputNode: SubgraphInputNode, input: SubgraphInput, fromReroute?: Reroute): void;
        dragNewFromSubgraphOutput(network: LinkNetwork, outputNode: SubgraphOutputNode, output: SubgraphOutput, fromReroute?: Reroute): void;
        /**
         * Drags a new link from a reroute to an input slot.
         * @param network The network that the link being connected belongs to
         * @param reroute The reroute that the link is being dragged from
         */
        dragFromReroute(network: LinkNetwork, reroute: Reroute): void;
        /**
         * Drags a new link from a reroute to an output slot.
         * @param network The network that the link being connected belongs to
         * @param reroute The reroute that the link is being dragged from
         */
        dragFromRerouteToOutput(network: LinkNetwork, reroute: Reroute): void;
        dragFromLinkSegment(network: LinkNetwork, linkSegment: LinkSegment): void;
        /**
         * Connects the links being dropped
         * @param event Contains the drop location, in canvas space
         */
        dropLinks(locator: ItemLocator, event: CanvasPointerEvent): void;
        dropOnIoNode(ioNode: SubgraphInputNode | SubgraphOutputNode, event: CanvasPointerEvent): void;
        dropOnNode(node: LGraphNode, event: CanvasPointerEvent): void;
        dropOnReroute(reroute: Reroute, event: CanvasPointerEvent): void;
        /* Excluded from this release type: _connectOutputToReroute */
        dropOnNothing(event: CanvasPointerEvent): void;
        /**
         * Disconnects all moving links.
         * @remarks This is called when the links are dropped on the canvas.
         * May be called by consumers to e.g. drag links into a bin / void.
         */
        disconnectLinks(): void;
        /**
         * Connects the links being dropped onto a node to the first matching slot.
         * @param node The node that the links are being dropped on
         * @param event Contains the drop location, in canvas space
         */
        connectToNode(node: LGraphNode, event: CanvasPointerEvent): void;
        isInputValidDrop(node: LGraphNode, input: INodeInputSlot): boolean;
        isNodeValidDrop(node: LGraphNode): boolean;
        isSubgraphInputValidDrop(input: SubgraphInput): boolean;
        /**
         * Checks if a reroute is a valid drop target for any of the links being connected.
         * @param reroute The reroute that would be dropped on.
         * @returns `true` if any of the current links being connected are valid for the given reroute.
         */
        isRerouteValidDrop(reroute: Reroute): boolean;
        /**
         * Exports the current state of the link connector.
         * @param network The network that the links being connected belong to.
         * @returns A POJO with the state of the link connector, links being connected, and their network.
         * @remarks Other than {@link network}, all properties are shallow cloned.
         */
        export(network: LinkNetwork): LinkConnectorExport;
        /**
         * Adds an event listener that will be automatically removed when the reset event is fired.
         * @param eventName The event to listen for.
         * @param listener The listener to call when the event is fired.
         */
        listenUntilReset<K extends keyof LinkConnectorEventMap>(eventName: K, listener: Parameters<typeof LinkConnector.events.addEventListener<K>>[1], options?: Parameters<typeof LinkConnector.events.addEventListener<K>>[2]): void;
        /**
         * Resets everything to its initial state.
         *
         * Effectively cancels moving or connecting links.
         */
        reset(force?: boolean): void;
    }

    export declare interface LinkConnectorEventMap {
        reset: boolean;
        'before-drop-links': {
            renderLinks: RenderLink[];
            event: CanvasPointerEvent;
        };
        'after-drop-links': {
            renderLinks: RenderLink[];
            event: CanvasPointerEvent;
        };
        'before-move-input': MovingInputLink | FloatingRenderLink;
        'before-move-output': MovingOutputLink | FloatingRenderLink;
        'input-moved': MovingInputLink | FloatingRenderLink | ToInputFromIoNodeLink;
        'output-moved': MovingOutputLink | FloatingRenderLink;
        'link-created': LLink | null | undefined;
        'dropped-on-reroute': {
            reroute: Reroute;
            event: CanvasPointerEvent;
        };
        'dropped-on-node': {
            node: LGraphNode;
            event: CanvasPointerEvent;
        };
        'dropped-on-io-node': {
            node: SubgraphInputNode | SubgraphOutputNode;
            event: CanvasPointerEvent;
        };
        'dropped-on-canvas': CanvasPointerEvent;
        'dropped-on-widget': {
            link: ToInputRenderLink;
            node: LGraphNode;
            widget: IWidget;
        };
    }

    export declare interface LinkConnectorExport {
        renderLinks: RenderLink[];
        inputLinks: LLink[];
        outputLinks: LLink[];
        floatingLinks: LLink[];
        state: LinkConnectorState;
        network: LinkNetwork;
    }

    /**
     * A Litegraph state object for the {@link LinkConnector}.
     * References are only held atomically within a function, never passed.
     * The concrete implementation may be replaced or proxied without side-effects.
     */
    export declare interface LinkConnectorState {
        /**
         * The type of slot that links are being connected **to**.
         * - When `undefined`, no operation is being performed.
         * - A change in this property indicates the start or end of dragging links.
         */
        connectingTo: 'input' | 'output' | undefined;
        multi: boolean;
        /** When `true`, existing links are being repositioned. Otherwise, new links are being created. */
        draggingExistingLinks: boolean;
        /** When set, connecting links will all snap to this position. */
        snapLinksPos?: [number, number];
    }

    /** The direction that a link point will flow towards - e.g. horizontal outputs are right by default */
    export declare enum LinkDirection {
        NONE = 0,
        UP = 1,
        DOWN = 2,
        LEFT = 3,
        RIGHT = 4,
        CENTER = 5
    }

    export declare type LinkId = number;

    /** The marker in the middle of a link */
    export declare enum LinkMarkerShape {
        /** Do not display markers */
        None = 0,
        /** Circles (default) */
        Circle = 1,
        /** Directional arrows */
        Arrow = 2
    }

    /**
     * Contains a list of links, reroutes, and nodes.
     */
    export declare interface LinkNetwork extends ReadonlyLinkNetwork {
        readonly links: Map<LinkId, LLink>;
        readonly reroutes: Map<RerouteId, Reroute>;
        addFloatingLink(link: LLink): LLink;
        removeReroute(id: number): unknown;
        removeFloatingLink(link: LLink): void;
    }

    export declare interface LinkRenderContext {
        renderMode: LinkRenderType;
        connectionWidth: number;
        renderBorder: boolean;
        lowQuality: boolean;
        highQualityRender: boolean;
        scale: number;
        linkMarkerShape: LinkMarkerShape;
        renderConnectionArrows: boolean;
        highlightedLinks: Set<string | number>;
        defaultLinkColor: CanvasColour;
        linkTypeColors: Record<string, CanvasColour>;
        disabledPattern?: CanvasPattern | null;
    }

    /** The path calculation that links follow */
    export declare enum LinkRenderType {
        HIDDEN_LINK = -1,
        /** Juts out from the input & output a little @see LinkDirection, then a straight line between them */
        STRAIGHT_LINK = 0,
        /** 90° angles, clean and box-like */
        LINEAR_LINK = 1,
        /** Smooth curved links - default */
        SPLINE_LINK = 2
    }

    /** Contains a cached 2D canvas path and a centre point, with an optional forward angle. */
    export declare interface LinkSegment {
        /** Link / reroute ID */
        readonly id: LinkId | RerouteId;
        /** The {@link id} of the reroute that this segment starts from (output side), otherwise `undefined`.  */
        readonly parentId?: RerouteId;
        /** The last canvas 2D path that was used to render this segment */
        path?: Path2D;
        /** Centre point of the {@link path}.  Calculated during render only - can be inaccurate */
        readonly _pos: Point;
        /**
         * Y-forward along the {@link path} from its centre point, in radians.
         * `undefined` if using circles for link centres.
         * Calculated during render only - can be inaccurate.
         */
        _centreAngle?: number;
        /* Excluded from this release type: _dragging */
        /** Output node ID */
        readonly origin_id: NodeId | undefined;
        /** Output slot index */
        readonly origin_slot: number | undefined;
    }

    export declare const LiteGraph: LiteGraphGlobal;

    /**
     * The Global Scope. It contains all the registered node classes.
     */
    export declare class LiteGraphGlobal {
        SlotShape: typeof SlotShape;
        SlotDirection: typeof SlotDirection;
        SlotType: typeof SlotType;
        LabelPosition: typeof LabelPosition;
        /** Used in serialised graphs at one point. */
        VERSION: 0.4;
        CANVAS_GRID_SIZE: number;
        NODE_TITLE_HEIGHT: number;
        NODE_TITLE_TEXT_Y: number;
        NODE_SLOT_HEIGHT: number;
        NODE_WIDGET_HEIGHT: number;
        NODE_WIDTH: number;
        NODE_MIN_WIDTH: number;
        NODE_COLLAPSED_RADIUS: number;
        NODE_COLLAPSED_WIDTH: number;
        NODE_TITLE_COLOR: string;
        NODE_SELECTED_TITLE_COLOR: string;
        NODE_TEXT_SIZE: number;
        NODE_TEXT_COLOR: string;
        NODE_TEXT_HIGHLIGHT_COLOR: string;
        NODE_SUBTEXT_SIZE: number;
        NODE_DEFAULT_COLOR: string;
        NODE_DEFAULT_BGCOLOR: string;
        NODE_DEFAULT_BOXCOLOR: string;
        NODE_DEFAULT_SHAPE: RenderShape;
        NODE_BOX_OUTLINE_COLOR: string;
        NODE_ERROR_COLOUR: string;
        NODE_FONT: string;
        NODE_DEFAULT_BYPASS_COLOR: string;
        NODE_OPACITY: number;
        DEFAULT_FONT: string;
        DEFAULT_SHADOW_COLOR: string;
        DEFAULT_GROUP_FONT: number;
        DEFAULT_GROUP_FONT_SIZE?: any;
        GROUP_FONT: string;
        WIDGET_BGCOLOR: string;
        WIDGET_OUTLINE_COLOR: string;
        WIDGET_PROMOTED_OUTLINE_COLOR: string;
        WIDGET_ADVANCED_OUTLINE_COLOR: string;
        WIDGET_TEXT_COLOR: string;
        WIDGET_SECONDARY_TEXT_COLOR: string;
        WIDGET_DISABLED_TEXT_COLOR: string;
        LINK_COLOR: string;
        EVENT_LINK_COLOR: string;
        CONNECTING_LINK_COLOR: string;
        /** avoid infinite loops */
        MAX_NUMBER_OF_NODES: number;
        /** default node position */
        DEFAULT_POSITION: number[];
        /** ,"circle" */
        VALID_SHAPES: ("round" | "default" | "box" | "card")[];
        ROUND_RADIUS: number;
        BOX_SHAPE: RenderShape;
        ROUND_SHAPE: RenderShape;
        CIRCLE_SHAPE: RenderShape;
        CARD_SHAPE: RenderShape;
        ARROW_SHAPE: RenderShape;
        /** intended for slot arrays */
        GRID_SHAPE: RenderShape;
        INPUT: NodeSlotType;
        OUTPUT: NodeSlotType;
        /** for outputs */
        EVENT: -1;
        /** for inputs */
        ACTION: -1;
        /** helper, will add "On Request" and more in the future */
        NODE_MODES: string[];
        /** use with node_box_coloured_by_mode */
        NODE_MODES_COLORS: string[];
        ALWAYS: LGraphEventMode;
        ON_EVENT: LGraphEventMode;
        NEVER: LGraphEventMode;
        ON_TRIGGER: LGraphEventMode;
        UP: LinkDirection;
        DOWN: LinkDirection;
        LEFT: LinkDirection;
        RIGHT: LinkDirection;
        CENTER: LinkDirection;
        /** helper */
        LINK_RENDER_MODES: string[];
        HIDDEN_LINK: LinkRenderType;
        STRAIGHT_LINK: LinkRenderType;
        LINEAR_LINK: LinkRenderType;
        SPLINE_LINK: LinkRenderType;
        NORMAL_TITLE: TitleMode;
        NO_TITLE: TitleMode;
        TRANSPARENT_TITLE: TitleMode;
        AUTOHIDE_TITLE: TitleMode;
        /** arrange nodes vertically */
        VERTICAL_LAYOUT: string;
        /** used to redirect calls */
        proxy: null;
        node_images_path: string;
        debug: boolean;
        catch_exceptions: boolean;
        throw_errors: boolean;
        /** if set to true some nodes like Formula would be allowed to evaluate code that comes from unsafe sources (like node configuration), which could lead to exploits */
        allow_scripts: boolean;
        /** nodetypes by string */
        registered_node_types: Record<string, typeof LGraphNode>;
        /** @deprecated used for dropping files in the canvas.  It appears the code that enables this was removed, but the object remains and is references by built-in drag drop. */
        node_types_by_file_extension: Record<string, {
            type: string;
        }>;
        /** node types by classname */
        Nodes: Record<string, typeof LGraphNode>;
        /** used to store vars between graphs */
        Globals: {};
        /** @deprecated Unused and will be deleted. */
        searchbox_extras: Dictionary<unknown>;
        /** [true!] this make the nodes box (top left circle) coloured when triggered (execute/action), visual feedback */
        node_box_coloured_when_on: boolean;
        /** [true!] nodebox based on node mode, visual feedback */
        node_box_coloured_by_mode: boolean;
        /** [false on mobile] better true if not touch device, TODO add an helper/listener to close if false */
        dialog_close_on_mouse_leave: boolean;
        dialog_close_on_mouse_leave_delay: number;
        /** [false!] prefer false if results too easy to break links - implement with ALT or TODO custom keys */
        shift_click_do_break_link_from: boolean;
        /** [false!]prefer false, way too easy to break links */
        click_do_break_link_to: boolean;
        /** [true!] who accidentally ctrl-alt-clicks on an in/output? nobody! that's who! */
        ctrl_alt_click_do_break_link: boolean;
        /** [true!] snaps links when dragging connections over valid targets */
        snaps_for_comfy: boolean;
        /** [true!] renders a partial border to highlight when a dragged link is snapped to a node */
        snap_highlights_node: boolean;
        /**
         * If `true`, items always snap to the grid - modifier keys are ignored.
         * When {@link snapToGrid} is falsy, a value of `1` is used.
         * Default: `false`
         */
        alwaysSnapToGrid?: boolean;
        /**
         * When set to a positive number, when nodes are moved their positions will
         * be rounded to the nearest multiple of this value.  Half up.
         * Default: `undefined`
         * @todo Not implemented - see {@link LiteGraph.CANVAS_GRID_SIZE}
         */
        snapToGrid?: number;
        /** [false on mobile] better true if not touch device, TODO add an helper/listener to close if false */
        search_hide_on_mouse_leave: boolean;
        /**
         * [true!] enable filtering slots type in the search widget
         * !requires auto_load_slot_types or manual set registered_slot_[in/out]_types and slot_types_[in/out]
         */
        search_filter_enabled: boolean;
        /** [true!] opens the results list when opening the search widget */
        search_show_all_on_open: boolean;
        /**
         * [if want false, use true, run, get vars values to be statically set, than disable]
         * nodes types and nodeclass association with node types need to be calculated,
         * if dont want this, calculate once and set registered_slot_[in/out]_types and slot_types_[in/out]
         */
        auto_load_slot_types: boolean;
        /** slot types for nodeclass */
        registered_slot_in_types: Record<string, {
            nodes: string[];
        }>;
        /** slot types for nodeclass */
        registered_slot_out_types: Record<string, {
            nodes: string[];
        }>;
        /** slot types IN */
        slot_types_in: string[];
        /** slot types OUT */
        slot_types_out: string[];
        /**
         * specify for each IN slot type a(/many) default node(s), use single string, array, or object
         * (with node, title, parameters, ..) like for search
         */
        slot_types_default_in: Record<string, string[]>;
        /**
         * specify for each OUT slot type a(/many) default node(s), use single string, array, or object
         * (with node, title, parameters, ..) like for search
         */
        slot_types_default_out: Record<string, string[]>;
        /** [true!] very handy, ALT click to clone and drag the new node */
        alt_drag_do_clone_nodes: boolean;
        /**
         * [true!] will create and connect event slots when using action/events connections,
         * !WILL CHANGE node mode when using onTrigger (enable mode colors), onExecuted does not need this
         */
        do_add_triggers_slots: boolean;
        /** [false!] being events, it is strongly recommended to use them sequentially, one by one */
        allow_multi_output_for_events: boolean;
        /** [true!] allows to create and connect a node clicking with the third button (wheel) */
        middle_click_slot_add_default_node: boolean;
        /** [true!] dragging a link to empty space will open a menu, add from list, search or defaults */
        release_link_on_empty_shows_menu: boolean;
        /** "mouse"|"pointer" use mouse for retrocompatibility issues? (none found @ now) */
        pointerevents_method: string;
        /**
         * [true!] allows ctrl + shift + v to paste nodes with the outputs of the unselected nodes connected
         * with the inputs of the newly pasted nodes
         */
        ctrl_shift_v_paste_connect_unselected_outputs: boolean;
        use_uuids: boolean;
        highlight_selected_group: boolean;
        /** Whether to scale context with the graph when zooming in.  Zooming out never makes context menus smaller. */
        context_menu_scaling: boolean;
        /**
         * Debugging flag. Repeats deprecation warnings every time they are reported.
         * May impact performance.
         */
        alwaysRepeatWarnings: boolean;
        /**
         * Array of callbacks to execute when Litegraph first reports a deprecated API being used.
         * @see alwaysRepeatWarnings By default, will not repeat identical messages.
         */
        onDeprecationWarning: ((message: string, source?: object) => void)[];
        /**
         * @deprecated Removed; has no effect.
         * If `true`, mouse wheel events will be interpreted as trackpad gestures.
         * Tested on MacBook M4 Pro.
         * @default false
         * @see macGesturesRequireMac
         */
        macTrackpadGestures: boolean;
        /**
         * @deprecated Removed; has no effect.
         * If both this setting and {@link macTrackpadGestures} are `true`, trackpad gestures will
         * only be enabled when the browser user agent includes "Mac".
         * @default true
         * @see macTrackpadGestures
         */
        macGesturesRequireMac: boolean;
        /**
         * "standard": change the dragging on left mouse button click to select, enable middle-click or spacebar+left-click dragging
         * "legacy": Enable dragging on left-click (original behavior)
         * "custom": Use leftMouseClickBehavior and mouseWheelScroll settings
         * @default "legacy"
         */
        canvasNavigationMode: 'standard' | 'legacy' | 'custom';
        leftMouseClickBehavior: 'panning' | 'select';
        mouseWheelScroll: 'panning' | 'zoom';
        /**
         * If `true`, widget labels and values will both be truncated (proportionally to size),
         * until they fit within the widget.
         *
         * Otherwise, the label will be truncated completely before the value is truncated.
         * @default false
         */
        truncateWidgetTextEvenly: boolean;
        /**
         * If `true`, widget values will be completely truncated when shrinking a widget,
         * before truncating widget labels.  {@link truncateWidgetTextEvenly} must be `false`.
         * @default false
         */
        truncateWidgetValuesFirst: boolean;
        /**
         * If `true`, the current viewport scale & offset of the first attached canvas will be included with the graph when exporting.
         * @default true
         */
        saveViewportWithGraph: boolean;
        /**
         * Enable Vue nodes mode for rendering and positioning.
         * When true:
         * - Nodes will calculate slot positions using Vue component dimensions
         * - LiteGraph will skip rendering node bodies entirely
         * - Vue components will handle all node rendering
         * - LiteGraph continues to render connections, links, and graph background
         * This should be set by the frontend when the Vue nodes feature is enabled.
         * @default false
         */
        vueNodesMode: boolean;
        nodeOpacity: number;
        nodeLightness: number | undefined;
        LGraph: typeof LGraph;
        LLink: typeof LLink;
        LGraphNode: typeof LGraphNode;
        LGraphGroup: typeof LGraphGroup;
        DragAndScale: typeof DragAndScale;
        LGraphCanvas: typeof LGraphCanvas;
        ContextMenu: typeof ContextMenu;
        CurveEditor: typeof CurveEditor;
        Reroute: typeof Reroute;
        constructor();
        Classes: {
            readonly SubgraphSlot: typeof SubgraphSlot;
            readonly SubgraphIONodeBase: typeof SubgraphIONodeBase;
            readonly Rectangle: typeof Rectangle;
            readonly InputIndicators: typeof InputIndicators;
        };
        onNodeTypeRegistered?(type: string, base_class: typeof LGraphNode): void;
        onNodeTypeReplaced?(type: string, base_class: typeof LGraphNode, prev: unknown): void;
        /**
         * Register a node class so it can be listed when the user wants to create a new one
         * @param type name of the node and path
         * @param base_class class containing the structure of a node
         */
        registerNodeType(type: string, base_class: typeof LGraphNode): void;
        /**
         * removes a node type from the system
         * @param type name of the node or the node constructor itself
         */
        unregisterNodeType(type: string | typeof LGraphNode): void;
        /**
         * Save a slot type and his node
         * @param type name of the node or the node constructor itself
         * @param slot_type name of the slot type (variable type), eg. string, number, array, boolean, ..
         */
        registerNodeAndSlotType(type: LGraphNode, slot_type: ISlotType, out?: boolean): void;
        /**
         * Removes all previously registered node's types
         */
        clearRegisteredTypes(): void;
        /**
         * Create a node of a given type with a name. The node is not attached to any graph yet.
         * @param type full name of the node class. p.e. "math/sin"
         * @param title a name to distinguish from other nodes
         * @param options to set options
         */
        createNode(type: string, title?: string, options?: Dictionary<unknown>): LGraphNode | null;
        /**
         * Returns a registered node type with a given name
         * @param type full name of the node class. p.e. "math/sin"
         * @returns the node class
         */
        getNodeType(type: string): typeof LGraphNode;
        /**
         * Returns a list of node types matching one category
         * @param category category name
         * @returns array with all the node classes
         */
        getNodeTypesInCategory(category: string, filter?: string): (typeof LGraphNode)[];
        /**
         * Returns a list with all the node type categories
         * @param filter only nodes with ctor.filter equal can be shown
         * @returns array with all the names of the categories
         */
        getNodeTypesCategories(filter?: string): string[];
        reloadNodes(folder_wildcard: string): void;
        /** @deprecated Prefer {@link structuredClone} */
        cloneObject<T extends object | undefined | null>(obj: T, target?: T): WhenNullish<T, null>;
        /** @see {@link createUuidv4} @inheritdoc */
        uuidv4: typeof createUuidv4;
        /**
         * Returns if the types of two slots are compatible (taking into account wildcards, etc)
         * @param type_a output
         * @param type_b input
         * @returns true if they can be connected
         */
        isValidConnection(type_a: ISlotType, type_b: ISlotType): boolean;
        getParameterNames(func: (...args: any) => any): string[];
        pointerListenerAdd(oDOM: Node, sEvIn: string, fCall: (e: Event) => boolean | void, capture?: boolean): void;
        pointerListenerRemove(oDOM: Node, sEvent: string, fCall: (e: Event) => boolean | void, capture?: boolean): void;
        getTime(): number;
        distance: typeof distance;
        colorToString(c: [number, number, number, number]): string;
        isInsideRectangle: typeof isInsideRectangle;
        growBounding(bounding: Rect, x: number, y: number): void;
        overlapBounding: typeof overlapBounding;
        isInsideBounding(p: number[], bb: number[][]): boolean;
        hex2num(hex: string): number[];
        num2hex(triplet: number[]): string;
        closeAllContextMenus(ref_window?: Window): void;
        extendClass(target: any, origin: any): void;
    }

    export declare class LitegraphLinkAdapter {
        readonly enableLayoutStoreWrites: boolean;
        private readonly pathRenderer;
        constructor(enableLayoutStoreWrites?: boolean);
        /**
         * Convert LinkDirection enum to Direction string
         */
        private convertDirection;
        /**
         * Convert LinkRenderContext to PathRenderContext
         */
        private convertToPathRenderContext;
        /**
         * Convert LinkRenderType to RenderMode
         */
        private convertRenderMode;
        /**
         * Convert LinkMarkerShape to ArrowShape
         */
        private convertArrowShape;
        /**
         * Convert color map to ensure all values are strings
         */
        private convertColorMap;
        /**
         * Apply spline offset to a point, mimicking original #addSplineOffset behavior
         * Critically: does nothing for CENTER/NONE directions (no case for them)
         */
        private applySplineOffset;
        /**
         * Direct rendering method compatible with LGraphCanvas
         * Converts data and delegates to pure renderer
         */
        renderLinkDirect(ctx: CanvasRenderingContext2D, a: Readonly<Point>, b: Readonly<Point>, link: LLink | null, skip_border: boolean, flow: number | boolean | null, color: CanvasColour | null, start_dir: LinkDirection, end_dir: LinkDirection, context: LinkRenderContext, extras?: {
            reroute?: Reroute;
            startControl?: Readonly<Point>;
            endControl?: Readonly<Point>;
            num_sublines?: number;
            disabled?: boolean;
        }): void;
        renderDraggingLink(ctx: CanvasRenderingContext2D, from: Readonly<Point>, to: Readonly<Point>, colour: CanvasColour, startDir: LinkDirection, endDir: LinkDirection, context: LinkRenderContext): void;
        /**
         * Calculate bounding box for a link
         * Includes padding for line width and control points
         */
        private calculateLinkBounds;
    }

    export declare class LLink implements LinkSegment, Serialisable<SerialisableLLink> {
        #private;
        static _drawDebug: boolean;
        /** Link ID */
        id: LinkId;
        parentId?: RerouteId;
        type: ISlotType;
        /** Output node ID */
        origin_id: NodeId;
        /** Output slot index */
        origin_slot: number;
        /** Input node ID */
        target_id: NodeId;
        /** Input slot index */
        target_slot: number;
        data?: number | string | boolean | {
            toToolTip?(): string;
        };
        _data?: unknown;
        /** Centre point of the link, calculated during render only - can be inaccurate */
        _pos: Point;
        /** @todo Clean up - never implemented in comfy. */
        _last_time?: number;
        /** The last canvas 2D path that was used to render this link */
        path?: Path2D;
        /** @inheritdoc */
        _centreAngle?: number;
        /** @inheritdoc */
        _dragging?: boolean;
        /** Custom colour for this link only */
        get color(): CanvasColour | null | undefined;
        set color(value: CanvasColour);
        get isFloatingOutput(): boolean;
        get isFloatingInput(): boolean;
        get isFloating(): boolean;
        /** `true` if this link is connected to a subgraph input node (the actual origin is in a different graph). */
        get originIsIoNode(): boolean;
        /** `true` if this link is connected to a subgraph output node (the actual target is in a different graph). */
        get targetIsIoNode(): boolean;
        constructor(id: LinkId, type: ISlotType, origin_id: NodeId, origin_slot: number, target_id: NodeId, target_slot: number, parentId?: RerouteId);
        /** @deprecated Use {@link LLink.create} */
        static createFromArray(data: SerialisedLLinkArray): LLink;
        /**
         * LLink static factory: creates a new LLink from the provided data.
         * @param data Serialised LLink data to create the link from
         * @returns A new LLink
         */
        static create(data: SerialisableLLink): LLink;
        /**
         * Gets all reroutes from the output slot to this segment.  If this segment is a reroute, it will not be included.
         * @returns An ordered array of all reroutes from the node output to
         * this reroute or the reroute before it.  Otherwise, an empty array.
         */
        static getReroutes(network: Pick<ReadonlyLinkNetwork, 'reroutes'>, linkSegment: LinkSegment): Reroute[];
        static getFirstReroute(network: Pick<ReadonlyLinkNetwork, 'reroutes'>, linkSegment: LinkSegment): Reroute | undefined;
        /**
         * Finds the reroute in the chain after the provided reroute ID.
         * @param network The network this link belongs to
         * @param linkSegment The starting point of the search (input side).
         * Typically the LLink object itself, but can be any link segment.
         * @param rerouteId The matching reroute will have this set as its {@link parentId}.
         * @returns The reroute that was found, `undefined` if no reroute was found, or `null` if an infinite loop was detected.
         */
        static findNextReroute(network: Pick<ReadonlyLinkNetwork, 'reroutes'>, linkSegment: LinkSegment, rerouteId: RerouteId): Reroute | null | undefined;
        /**
         * Gets the origin node of a link.
         * @param network The network to search
         * @param linkId The ID of the link to get the origin node of
         * @returns The origin node of the link, or `undefined` if the link is not found or the origin node is not found
         */
        static getOriginNode(network: BasicReadonlyNetwork, linkId: LinkId): LGraphNode | undefined;
        /**
         * Gets the target node of a link.
         * @param network The network to search
         * @param linkId The ID of the link to get the target node of
         * @returns The target node of the link, or `undefined` if the link is not found or the target node is not found
         */
        static getTargetNode(network: BasicReadonlyNetwork, linkId: LinkId): LGraphNode | undefined;
        /**
         * Resolves a link ID to the link, node, and slot objects.
         * @param linkId The {@link id} of the link to resolve
         * @param network The link network to search
         * @returns An object containing the input and output nodes, as well as the input and output slots.
         * @remarks This method is heavier than others; it will always resolve all objects.
         * Whilst the performance difference should in most cases be negligible,
         * it is recommended to use simpler methods where appropriate.
         */
        static resolve(linkId: LinkId | null | undefined, network: BasicReadonlyNetwork): ResolvedConnection | undefined;
        /**
         * Resolves a list of link IDs to the link, node, and slot objects.
         * Discards invalid link IDs.
         * @param linkIds An iterable of link {@link id}s to resolve
         * @param network The link network to search
         * @returns An array of resolved connections.  If a link is not found, it is not included in the array.
         * @see {@link LLink.resolve}
         */
        static resolveMany(linkIds: Iterable<LinkId>, network: BasicReadonlyNetwork): ResolvedConnection[];
        /**
         * Resolves the primitive ID values stored in the link to the referenced objects.
         * @param network The link network to search
         * @returns An object containing the input and output nodes, as well as the input and output slots.
         * @remarks This method is heavier than others; it will always resolve all objects.
         * Whilst the performance difference should in most cases be negligible,
         * it is recommended to use simpler methods where appropriate.
         */
        resolve(network: BasicReadonlyNetwork): ResolvedConnection;
        configure(o: LLink | SerialisedLLinkArray): void;
        /**
         * Checks if the specified node id and output index are this link's origin (output side).
         * @param nodeId ID of the node to check
         * @param outputIndex The array index of the node output
         * @returns `true` if the origin matches, otherwise `false`.
         */
        hasOrigin(nodeId: NodeId, outputIndex: number): boolean;
        /**
         * Checks if the specified node id and input index are this link's target (input side).
         * @param nodeId ID of the node to check
         * @param inputIndex The array index of the node input
         * @returns `true` if the target matches, otherwise `false`.
         */
        hasTarget(nodeId: NodeId, inputIndex: number): boolean;
        /**
         * Creates a floating link from this link.
         * @param slotType The side of the link that is still connected
         * @param parentId The parent reroute ID of the link
         * @returns A new LLink that is floating
         */
        toFloating(slotType: 'input' | 'output', parentId: RerouteId): LLink;
        /**
         * Disconnects a link and removes it from the graph, cleaning up any reroutes that are no longer used
         * @param network The container (LGraph) where reroutes should be updated
         * @param keepReroutes If `undefined`, reroutes will be automatically removed if no links remain.
         * If `input` or `output`, reroutes will not be automatically removed, and retain a connection to the input or output, respectively.
         */
        disconnect(network: LinkNetwork, keepReroutes?: 'input' | 'output'): void;
        /**
         * @deprecated Prefer {@link LLink.asSerialisable} (returns an object, not an array)
         * @returns An array representing this LLink
         */
        serialize(): SerialisedLLinkArray;
        asSerialisable(): SerialisableLLink;
    }

    export declare interface LoadedComfyWorkflow extends ComfyWorkflow {
        isLoaded: true;
        originalContent: string;
        content: string;
        changeTracker: ChangeTracker;
        initialState: ComfyWorkflowJSON_2;
        activeState: ComfyWorkflowJSON_2;
    }

    export declare interface LoadedUserFile extends UserFile {
        isLoaded: true;
        originalContent: string;
        content: string;
    }

    export { LogEntry }

    export { LogsRawResponse }

    /**
     * Widget for displaying markdown formatted text
     * This is a widget that only has a Vue widgets implementation
     */
    export declare class MarkdownWidget extends BaseWidget<IMarkdownWidget> implements IMarkdownWidget {
        type: "markdown";
        drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
        onClick(_options: WidgetEventOptions): void;
    }

    export declare type MenuCommandGroup = {
        /**
         * The path to the menu group.
         */
        path: string[];
        /**
         * Command ids.
         * Note: Commands must be defined in `commands` array in the extension.
         */
        commands: string[];
    };

    /** The names of all (optional) methods and functions in T */
    export declare type MethodNames<T> = KeysOfType<T, ((...args: any) => any) | undefined>;

    export declare type MissingNodeType = string | {
        type: string;
        hint?: string;
        action?: {
            text: string;
            callback: () => void;
        };
    };

    export declare type ModelFile = z.infer<typeof zModelFile>;

    export declare interface ModelFolderInfo {
        name: string;
        folders: string[];
    }

    export declare class MovingInputLink extends MovingLinkBase {
        readonly toType = "input";
        readonly node: LGraphNode;
        readonly fromSlot: INodeOutputSlot;
        readonly fromPos: Point;
        readonly fromDirection: LinkDirection;
        readonly fromSlotIndex: number;
        constructor(network: LinkNetwork, link: LLink, fromReroute?: Reroute, dragDirection?: LinkDirection);
        canConnectToInput(inputNode: NodeLike, input: INodeInputSlot | SubgraphIO): boolean;
        canConnectToOutput(): false;
        canConnectToReroute(reroute: Reroute): boolean;
        connectToInput(inputNode: LGraphNode, input: INodeInputSlot, events: CustomEventTarget<LinkConnectorEventMap>): LLink | null | undefined;
        connectToOutput(): never;
        connectToSubgraphInput(): void;
        connectToSubgraphOutput(output: SubgraphOutput, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToRerouteInput(reroute: Reroute, { node: inputNode, input, link: existingLink }: {
            node: LGraphNode;
            input: INodeInputSlot;
            link: LLink;
        }, events: CustomEventTarget<LinkConnectorEventMap>, originalReroutes: Reroute[]): void;
        connectToRerouteOutput(): never;
        disconnect(): boolean;
    }

    /**
     * Represents an existing link that is currently being dragged by the user from one slot to another.
     *
     * This is a heavier, but short-lived convenience data structure.
     * All refs to {@link MovingInputLink} and {@link MovingOutputLink} should be discarded on drop.
     * @remarks
     * At time of writing, Litegraph is using several different styles and methods to handle link dragging.
     *
     * Once the library has undergone more substantial changes to the way links are managed,
     * many properties of this class will be superfluous and removable.
     */
    export declare abstract class MovingLinkBase implements RenderLink {
        readonly network: LinkNetwork;
        readonly link: LLink;
        readonly toType: 'input' | 'output';
        readonly fromReroute?: Reroute | undefined;
        readonly dragDirection: LinkDirection;
        abstract readonly node: LGraphNode;
        abstract readonly fromSlot: INodeOutputSlot | INodeInputSlot;
        abstract readonly fromPos: Point;
        abstract readonly fromDirection: LinkDirection;
        abstract readonly fromSlotIndex: number;
        readonly outputNodeId: NodeId;
        readonly outputNode: LGraphNode;
        readonly outputSlot: INodeOutputSlot;
        readonly outputIndex: number;
        readonly outputPos: Point;
        readonly inputNodeId: NodeId;
        readonly inputNode: LGraphNode;
        readonly inputSlot: INodeInputSlot;
        readonly inputIndex: number;
        readonly inputPos: Point;
        constructor(network: LinkNetwork, link: LLink, toType: 'input' | 'output', fromReroute?: Reroute | undefined, dragDirection?: LinkDirection);
        abstract canConnectToInput(inputNode: NodeLike, input: INodeInputSlot): boolean;
        abstract canConnectToOutput(outputNode: NodeLike, output: INodeOutputSlot): boolean;
        abstract connectToInput(node: LGraphNode, input: INodeInputSlot, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        abstract connectToOutput(node: LGraphNode, output: INodeOutputSlot, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        abstract connectToSubgraphInput(input: SubgraphInput, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        abstract connectToSubgraphOutput(output: SubgraphOutput, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        abstract connectToRerouteInput(reroute: Reroute, { node, input, link }: {
            node: LGraphNode;
            input: INodeInputSlot;
            link: LLink;
        }, events: CustomEventTarget<LinkConnectorEventMap>, originalReroutes: Reroute[]): void;
        abstract connectToRerouteOutput(reroute: Reroute, outputNode: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
        abstract disconnect(): boolean;
    }

    export declare class MovingOutputLink extends MovingLinkBase {
        readonly toType = "output";
        readonly node: LGraphNode;
        readonly fromSlot: INodeInputSlot;
        readonly fromPos: Point;
        readonly fromDirection: LinkDirection;
        readonly fromSlotIndex: number;
        constructor(network: LinkNetwork, link: LLink, fromReroute?: Reroute, dragDirection?: LinkDirection);
        canConnectToInput(): false;
        canConnectToOutput(outputNode: NodeLike, output: INodeOutputSlot | SubgraphIO): boolean;
        canConnectToReroute(reroute: Reroute): boolean;
        canConnectToSubgraphInput(input: SubgraphInput): boolean;
        connectToInput(): never;
        connectToOutput(outputNode: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): LLink | null | undefined;
        connectToSubgraphInput(input: SubgraphInput, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToSubgraphOutput(): void;
        connectToRerouteInput(): never;
        connectToRerouteOutput(reroute: Reroute, outputNode: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
        disconnect(): boolean;
    }

    /**
     * Widget for selecting multiple options
     * This is a widget that only has a Vue widgets implementation
     */
    export declare class MultiSelectWidget extends BaseWidget<IMultiSelectWidget> implements IMultiSelectWidget {
        type: "multiselect";
        drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
        onClick(_options: WidgetEventOptions): void;
    }

    /** {@link Omit} all properties that evaluate to `never`. */
    export declare type NeverNever<T> = {
        [K in keyof T as T[K] extends never ? never : K]: T[K];
    };

    /** {@link Omit} all properties that evaluate to `never`. */
    export declare type NeverNever_2<T> = {
        [K in keyof T as T[K] extends never ? never : K]: T[K];
    };

    export declare interface NewNodePosition {
        node: LGraphNode;
        newPos: {
            x: number;
            y: number;
        };
    }

    export { NodeError }

    /**
     * An execution identifier representing a node's position in nested subgraphs.
     * Also known as ExecutionId in some contexts.
     *
     * Format: Colon-separated path of node IDs
     * Example: "123:456:789" (node 789 in subgraph 456 in subgraph 123)
     */
    export export declare type NodeExecutionId = string;

    export declare type NodeId = number | string;

    export declare interface NodeLike {
        id: NodeId;
        canConnectTo(node: NodeLike, toSlot: INodeInputSlot | SubgraphIO, fromSlot: INodeOutputSlot | SubgraphIO): boolean;
    }

    /**
     * A globally unique identifier for nodes that maintains consistency across
     * multiple instances of the same subgraph.
     *
     * Format:
     * - For subgraph nodes: `<immediate-contained-subgraph-uuid>:<local-node-id>`
     * - For root graph nodes: `<local-node-id>`
     *
     * Examples:
     * - "a1b2c3d4-e5f6-7890-abcd-ef1234567890:123" (node in subgraph)
     * - "456" (node in root graph)
     *
     * Unlike execution IDs which change based on the instance path,
     * NodeLocatorId remains the same for all instances of a particular node.
     */
    export export declare type NodeLocatorId = string;

    export declare type NodeProperty = string | number | boolean | object;

    export declare interface NodePropertyChangedEvent {
        type: 'node:property:changed';
        nodeId: NodeId;
        property: string;
        oldValue: unknown;
        newValue: unknown;
    }

    export declare interface NodeSlotErrorsChangedEvent {
        type: 'node:slot-errors:changed';
        nodeId: NodeId;
    }

    export declare interface NodeSlotLinksChangedEvent {
        type: 'node:slot-links:changed';
        nodeId: NodeId;
        slotType: NodeSlotType;
        slotIndex: number;
        connected: boolean;
        linkId: number;
    }

    /** Node slot type - input or output */
    export declare enum NodeSlotType {
        INPUT = 1,
        OUTPUT = 2
    }

    /** Properties of nodes that are used by subgraph instances. */
    export declare type NodeSubgraphSharedProps = Omit<ISerialisedNode, 'properties' | 'showAdvanced'>;

    /** Allows all properties to be null.  The same as `Partial<T>`, but adds null instead of undefined. */
    export declare type NullableProperties<T> = {
        [P in keyof T]: T[P] | null;
    };

    export declare class NumberWidget extends BaseSteppedWidget<INumericWidget> implements INumericWidget {
        type: "number";
        get _displayValue(): string;
        canIncrement(): boolean;
        canDecrement(): boolean;
        incrementValue(options: WidgetEventOptions): void;
        decrementValue(options: WidgetEventOptions): void;
        setValue(value: number, options: WidgetEventOptions): void;
        onClick({ e, node, canvas }: WidgetEventOptions): void;
        /**
         * Handles drag events for the number widget
         * @param options The options for handling the drag event
         */
        onDrag({ e, node, canvas }: WidgetEventOptions): void;
    }

    /** A type with each of the {@link Properties} made optional. */
    export declare type OptionalProps<T, Properties extends keyof T> = Omit<T, Properties> & {
        [K in Properties]?: T[K];
    };

    /**
     * Determines if two rectangles have any overlap
     * @param a Rectangle A as `x, y, width, height`
     * @param b Rectangle B as `x, y, width, height`
     * @returns `true` if rectangles overlap, otherwise `false`
     */
    export declare function overlapBounding(a: ReadOnlyRect, b: ReadOnlyRect): boolean;

    export declare type ParamsArray<T extends Record<any, any>, K extends MethodNames<T>> = Parameters<T[K]>[1] extends undefined ? Parameters<T[K]> | Parameters<T[K]>[0] : Parameters<T[K]>;

    /** An object containing a set of child objects */
    export declare interface Parent<TChild> {
        /** All objects owned by the parent object. */
        readonly children?: ReadonlySet<TChild>;
    }

    /**
     * Parse a NodeExecutionId into its component node IDs
     * @param id The NodeExecutionId to parse
     * @returns Array of node IDs from root to target, or null if not an execution ID
     */
    export export declare function parseNodeExecutionId(id: string): NodeId_2[] | null;

    /**
     * Parse a NodeLocatorId into its components
     * @param id The NodeLocatorId to parse
     * @returns The subgraph UUID and local node ID, or null if invalid
     */
    export export declare function parseNodeLocatorId(id: string): {
        subgraphUuid: string | null;
        localNodeId: NodeId_2;
    } | null;

    /**
     * General-purpose, TypeScript utility types.
     */
    /** {@link Pick} only properties that evaluate to `never`. */
    export declare type PickNevers<T> = {
        [K in keyof T as T[K] extends never ? K : never]: T[K];
    };

    /** {@link Pick} only properties that evaluate to `never`. */
    export declare type PickNevers_2<T> = {
        [K in keyof T as T[K] extends never ? K : never]: T[K];
    };

    /** A point represented as `[x, y]` co-ordinates */
    export declare type Point = [x: number, y: number];

    /**
     * An object that can be positioned, selected, and moved.
     *
     * May contain other {@link Positionable} objects.
     */
    export declare interface Positionable extends Parent<Positionable>, HasBoundingRect {
        readonly id: NodeId | RerouteId | number;
        /**
         * Position in graph coordinates. This may be the top-left corner,
         * the centre, or another point depending on concrete type.
         * @default 0,0
         */
        readonly pos: Point;
        readonly size?: Size;
        /** true if this object is part of the selection, otherwise false. */
        selected?: boolean;
        /** See {@link IPinnable.pinned} */
        readonly pinned?: boolean;
        /**
         * When explicitly set to `false`, no options to delete this item will be provided.
         * @default undefined (true)
         */
        readonly removable?: boolean;
        /**
         * Adds a delta to the current position.
         * @param deltaX X value to add to current position
         * @param deltaY Y value to add to current position
         * @param skipChildren If true, any child objects like group contents will not be moved
         */
        move(deltaX: number, deltaY: number, skipChildren?: boolean): void;
        /**
         * Snaps this item to a grid.
         *
         * Position values are rounded to the nearest multiple of {@link snapTo}.
         * @param snapTo The size of the grid to align to
         * @returns `true` if it moved, or `false` if the snap was rejected (e.g. `pinned`)
         */
        snapToGrid(snapTo: number): boolean;
        /** Called whenever the item is selected */
        onSelected?(): void;
        /** Called whenever the item is deselected */
        onDeselected?(): void;
    }

    export declare type PromptDialog = Omit<IDialog, 'modified'>;

    export { PromptResponse }

    /**
     * Options for queuePrompt method
     */
    export declare interface QueuePromptOptions {
        /**
         * Optional list of node execution IDs to execute (partial execution).
         * Each ID represents a node's position in nested subgraphs.
         * Format: Colon-separated path of node IDs (e.g., "123:456:789")
         */
        partialExecutionTargets?: NodeExecutionId[];
        /**
         * Override the preview method for this prompt execution.
         * 'default' uses the server's CLI setting and is not sent to backend.
         */
        previewMethod?: PreviewMethod;
    }

    export declare interface ReadonlyLinkNetwork {
        readonly links: ReadonlyMap<LinkId, LLink>;
        readonly reroutes: ReadonlyMap<RerouteId, Reroute>;
        readonly floatingLinks: ReadonlyMap<LinkId, LLink>;
        getNodeById(id: NodeId | null | undefined): LGraphNode | null;
        getLink(id: null | undefined): undefined;
        getLink(id: LinkId | null | undefined): LLink | undefined;
        getReroute(parentId: null | undefined): undefined;
        getReroute(parentId: RerouteId | null | undefined): Reroute | undefined;
        readonly inputNode?: SubgraphInputNode;
        readonly outputNode?: SubgraphOutputNode;
    }

    /** A rectangle starting at top-left coordinates `[x, y, width, height]` that will not be modified */
    export declare type ReadOnlyRect = readonly [x: number, y: number, width: number, height: number] | ReadOnlyTypedArray<Float64Array>;

    export declare type ReadOnlyRectangle = Omit<ReadOnlyTypedArray<Rectangle>, 'setHeightBottomAnchored' | 'setWidthRightAnchored' | 'resizeTopLeft' | 'resizeBottomLeft' | 'resizeTopRight' | 'resizeBottomRight' | 'resizeBottomRight' | 'updateTo'>;

    export declare type ReadOnlyTypedArray<T extends Float64Array> = Omit<Readonly<T>, 'fill' | 'copyWithin' | 'reverse' | 'set' | 'sort' | 'subarray'>;

    /** A rectangle starting at top-left coordinates `[x, y, width, height]` */
    export declare type Rect = [x: number, y: number, width: number, height: number] | Float64Array;

    /**
     * A rectangle, represented as a float64 array of 4 numbers: [x, y, width, height].
     *
     * This class is a subclass of Float64Array, and so has all the methods of that class.  Notably,
     * {@link Rectangle.from} can be used to convert a {@link ReadOnlyRect}. Typing of this however,
     * is broken due to the base TS lib returning Float64Array rather than `this`.
     *
     * Sub-array properties ({@link Float64Array.subarray}):
     * - {@link pos}: The position of the top-left corner of the rectangle.
     * - {@link size}: The size of the rectangle.
     */
    export declare class Rectangle extends Float64Array {
        #private;
        constructor(x?: number, y?: number, width?: number, height?: number);
        static from([x, y, width, height]: ReadOnlyRect): Rectangle;
        /**
         * Creates a new rectangle positioned at the given centre, with the given width/height.
         * @param centre The centre of the rectangle, as an `[x, y]` point
         * @param width The width of the rectangle
         * @param height The height of the rectangle.  Default: {@link width}
         * @returns A new rectangle whose centre is at {@link x}
         */
        static fromCentre([x, y]: Readonly<Point>, width: number, height?: number): Rectangle;
        static ensureRect(rect: ReadOnlyRect): Rectangle;
        subarray(begin?: number, end?: number): Float64Array<ArrayBuffer>;
        /**
         * A reference to the position of the top-left corner of this rectangle.
         *
         * Updating the values of the returned object will update this rectangle.
         */
        get pos(): Point;
        set pos(value: Readonly<Point>);
        /**
         * A reference to the size of this rectangle.
         *
         * Updating the values of the returned object will update this rectangle.
         */
        get size(): Size;
        set size(value: Readonly<Size>);
        /** The x co-ordinate of the top-left corner of this rectangle. */
        get x(): number;
        set x(value: number);
        /** The y co-ordinate of the top-left corner of this rectangle. */
        get y(): number;
        set y(value: number);
        /** The width of this rectangle. */
        get width(): number;
        set width(value: number);
        /** The height of this rectangle. */
        get height(): number;
        set height(value: number);
        /** The x co-ordinate of the left edge of this rectangle. */
        get left(): number;
        set left(value: number);
        /** The y co-ordinate of the top edge of this rectangle. */
        get top(): number;
        set top(value: number);
        /** The x co-ordinate of the right edge of this rectangle. */
        get right(): number;
        set right(value: number);
        /** The y co-ordinate of the bottom edge of this rectangle. */
        get bottom(): number;
        set bottom(value: number);
        /** The x co-ordinate of the centre of this rectangle. */
        get centreX(): number;
        /** The y co-ordinate of the centre of this rectangle. */
        get centreY(): number;
        /**
         * Updates the rectangle to the values of {@link rect}.
         * @param rect The rectangle to update to.
         */
        updateTo(rect: ReadOnlyRect): void;
        /**
         * Checks if the point [{@link x}, {@link y}] is inside this rectangle.
         * @param x The x-coordinate to check
         * @param y The y-coordinate to check
         * @returns `true` if the point is inside this rectangle, otherwise `false`.
         */
        containsXy(x: number, y: number): boolean;
        /**
         * Checks if {@link point} is inside this rectangle.
         * @param point The point to check
         * @returns `true` if {@link point} is inside this rectangle, otherwise `false`.
         */
        containsPoint([x, y]: Readonly<Point>): boolean;
        /**
         * Checks if {@link other} is a smaller rectangle inside this rectangle.
         * One **must** be larger than the other; identical rectangles are not considered to contain each other.
         * @param other The rectangle to check
         * @returns `true` if {@link other} is inside this rectangle, otherwise `false`.
         */
        containsRect(other: ReadOnlyRect): boolean;
        /**
         * Checks if {@link rect} overlaps with this rectangle.
         * @param rect The rectangle to check
         * @returns `true` if {@link rect} overlaps with this rectangle, otherwise `false`.
         */
        overlaps(rect: ReadOnlyRect): boolean;
        /**
         * Finds the corner (if any) of this rectangle that contains the point [{@link x}, {@link y}].
         * @param x The x-coordinate to check
         * @param y The y-coordinate to check
         * @param cornerSize Each corner is treated as an inset square with this width and height.
         * @returns The compass direction of the corner that contains the point, or `undefined` if the point is not in any corner.
         */
        findContainingCorner(x: number, y: number, cornerSize: number): CompassCorners | undefined;
        /** @returns `true` if the point [{@link x}, {@link y}] is in the top-left corner of this rectangle, otherwise `false`. */
        isInTopLeftCorner(x: number, y: number, cornerSize: number): boolean;
        /** @returns `true` if the point [{@link x}, {@link y}] is in the top-right corner of this rectangle, otherwise `false`. */
        isInTopRightCorner(x: number, y: number, cornerSize: number): boolean;
        /** @returns `true` if the point [{@link x}, {@link y}] is in the bottom-left corner of this rectangle, otherwise `false`. */
        isInBottomLeftCorner(x: number, y: number, cornerSize: number): boolean;
        /** @returns `true` if the point [{@link x}, {@link y}] is in the bottom-right corner of this rectangle, otherwise `false`. */
        isInBottomRightCorner(x: number, y: number, cornerSize: number): boolean;
        /** @returns `true` if the point [{@link x}, {@link y}] is in the top edge of this rectangle, otherwise `false`. */
        isInTopEdge(x: number, y: number, edgeSize: number): boolean;
        /** @returns `true` if the point [{@link x}, {@link y}] is in the bottom edge of this rectangle, otherwise `false`. */
        isInBottomEdge(x: number, y: number, edgeSize: number): boolean;
        /** @returns `true` if the point [{@link x}, {@link y}] is in the left edge of this rectangle, otherwise `false`. */
        isInLeftEdge(x: number, y: number, edgeSize: number): boolean;
        /** @returns `true` if the point [{@link x}, {@link y}] is in the right edge of this rectangle, otherwise `false`. */
        isInRightEdge(x: number, y: number, edgeSize: number): boolean;
        /** @returns The centre point of this rectangle, as a new {@link Point}. */
        getCentre(): Point;
        /** @returns The area of this rectangle. */
        getArea(): number;
        /** @returns The perimeter of this rectangle. */
        getPerimeter(): number;
        /** @returns The top-left corner of this rectangle, as a new {@link Point}. */
        getTopLeft(): Point;
        /** @returns The bottom-right corner of this rectangle, as a new {@link Point}. */
        getBottomRight(): Point;
        /** @returns The width and height of this rectangle, as a new {@link Size}. */
        getSize(): Size;
        /** @returns The offset from the top-left of this rectangle to the point [{@link x}, {@link y}], as a new {@link Point}. */
        getOffsetTo([x, y]: Readonly<Point>): Point;
        /** @returns The offset from the point [{@link x}, {@link y}] to the top-left of this rectangle, as a new {@link Point}. */
        getOffsetFrom([x, y]: Readonly<Point>): Point;
        /** Resizes the rectangle without moving it, setting its top-left corner to [{@link x}, {@link y}]. */
        resizeTopLeft(x1: number, y1: number): void;
        /** Resizes the rectangle without moving it, setting its bottom-left corner to [{@link x}, {@link y}]. */
        resizeBottomLeft(x1: number, y2: number): void;
        /** Resizes the rectangle without moving it, setting its top-right corner to [{@link x}, {@link y}]. */
        resizeTopRight(x2: number, y1: number): void;
        /** Resizes the rectangle without moving it, setting its bottom-right corner to [{@link x}, {@link y}]. */
        resizeBottomRight(x2: number, y2: number): void;
        /** Sets the width without moving the right edge (changes position) */
        setWidthRightAnchored(width: number): void;
        /** Sets the height without moving the bottom edge (changes position) */
        setHeightBottomAnchored(height: number): void;
        clone(): Rectangle;
        /** Alias of {@link export}. */
        toArray(): [number, number, number, number];
        /** @returns A new, untyped array (serializable) containing the values of this rectangle. */
        export(): [number, number, number, number];
        /* Excluded from this release type: _drawDebug */
    }

    export declare type RendererType = 'LG' | 'Vue';

    export declare interface RenderLink {
        /** The type of link being connected. */
        readonly toType: 'input' | 'output';
        /** The source {@link Point} of the link being connected. */
        readonly fromPos: Point;
        /** The direction the link starts off as.  If {@link toType} is `output`, this will be the direction the link input faces. */
        readonly fromDirection: LinkDirection;
        /** If set, this will force a dragged link "point" from the cursor in the specified direction. */
        dragDirection: LinkDirection;
        /** The network that the link belongs to. */
        readonly network: LinkNetwork;
        /** The node that the link is being connected from. */
        readonly node: LGraphNode | SubgraphIONodeBase<SubgraphInput | SubgraphOutput>;
        /** The slot that the link is being connected from. */
        readonly fromSlot: INodeOutputSlot | INodeInputSlot | SubgraphInput | SubgraphOutput;
        /** The index of the slot that the link is being connected from. */
        readonly fromSlotIndex: number;
        /** The reroute that the link is being connected from. */
        readonly fromReroute?: Reroute;
        /**
         * Capability checks used for hit-testing and validation during drag.
         * Implementations should return `false` when a connection is not possible
         * rather than throwing.
         */
        canConnectToInput(node: NodeLike, input: INodeInputSlot): boolean;
        canConnectToOutput(node: NodeLike, output: INodeOutputSlot): boolean;
        /** Optional: only some links support validating subgraph IO or reroutes. */
        canConnectToSubgraphInput?(input: SubgraphInput): boolean;
        canConnectToReroute?(reroute: Reroute): boolean;
        connectToInput(node: LGraphNode, input: INodeInputSlot, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToOutput(node: LGraphNode, output: INodeOutputSlot, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToSubgraphInput(input: SubgraphInput, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToSubgraphOutput(output: SubgraphOutput, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToRerouteInput(reroute: Reroute, { node, input, link }: {
            node: LGraphNode;
            input: INodeInputSlot;
            link: LLink;
        }, events: CustomEventTarget<LinkConnectorEventMap>, originalReroutes: Reroute[]): void;
        connectToRerouteOutput(reroute: Reroute, outputNode: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
    }

    /** Discriminated union to simplify type narrowing. */
    export declare type RenderLinkUnion = MovingInputLink | MovingOutputLink | FloatingRenderLink | ToInputRenderLink | ToOutputRenderLink | ToInputFromIoNodeLink | ToOutputFromIoNodeLink;

    /** Shape that an object will render as - used by nodes and slots */
    export declare enum RenderShape {
        /** Rectangle with square corners */
        BOX = 1,
        /** Rounded rectangle */
        ROUND = 2,
        /** Circle is circle */
        CIRCLE = 3,
        /** Two rounded corners: top left & bottom right */
        CARD = 4,
        /** Slot shape: Arrow */
        ARROW = 5,
        /** Slot shape: Grid */
        GRID = 6,
        /** Slot shape: Hollow circle  */
        HollowCircle = 7
    }

    /** A type with each of the {@link Properties} marked as required. */
    export declare type RequiredProps<T, Properties extends keyof T> = Omit<T, Properties> & {
        [K in Properties]-?: T[K];
    };

    /**
     * Represents an additional point on the graph that a link path will travel through.  Used for visual organisation only.
     *
     * Requires no disposal or clean up.
     * Stores only primitive values (IDs) to reference other items in its network,
     * and a `WeakRef` to a {@link LinkNetwork} to resolve them.
     */
    export declare class Reroute implements Positionable, LinkSegment, Serialisable<SerialisableReroute> {
        readonly id: RerouteId;
        static radius: number;
        /** Maximum distance from reroutes to their bezier curve control points. */
        static maxSplineOffset: number;
        static drawIdBadge: boolean;
        static slotRadius: number;
        /** Distance from reroute centre to slot centre. */
        static get slotOffset(): number;
        /** The network this reroute belongs to.  Contains all valid links and reroutes. */
        private readonly network;
        private parentIdInternal?;
        get parentId(): RerouteId | undefined;
        /** Ignores attempts to create an infinite loop. @inheritdoc */
        set parentId(value: RerouteId | undefined);
        get parent(): Reroute | undefined;
        /** This property is only defined on the last reroute of a floating reroute chain (closest to input end). */
        floating?: FloatingRerouteSlot;
        private readonly posInternal;
        /** @inheritdoc */
        get pos(): Point;
        set pos(value: Point);
        /** @inheritdoc */
        get boundingRect(): ReadOnlyRect;
        /**
         * Slightly over-sized rectangle, guaranteed to contain the entire surface area for hover detection.
         * Eliminates most hover positions using an extremely cheap check.
         */
        private get hoverArea();
        /** The total number of links & floating links using this reroute */
        get totalLinks(): number;
        /** @inheritdoc */
        selected?: boolean;
        /** The ID ({@link LLink.id}) of every link using this reroute */
        linkIds: Set<LinkId>;
        /** The ID ({@link LLink.id}) of every floating link using this reroute */
        floatingLinkIds: Set<LinkId>;
        /** Cached cos */
        cos: number;
        sin: number;
        /** Bezier curve control point for the "target" (input) side of the link */
        controlPoint: Point;
        /** @inheritdoc */
        path?: Path2D;
        /** @inheritdoc */
        _centreAngle?: number;
        /** @inheritdoc */
        _pos: Point;
        /** @inheritdoc */
        _dragging?: boolean;
        /** Colour of the first link that rendered this reroute */
        _colour?: CanvasColour;
        /** Colour of the first link that rendered this reroute */
        get colour(): CanvasColour;
        /**
         * Used to ensure reroute angles are only executed once per frame.
         * @todo Calculate on change instead.
         */
        private lastRenderTime;
        private readonly inputSlot;
        private readonly outputSlot;
        get isSlotHovered(): boolean;
        get isInputHovered(): boolean;
        get isOutputHovered(): boolean;
        get firstLink(): LLink | undefined;
        get firstFloatingLink(): LLink | undefined;
        /** @inheritdoc */
        get origin_id(): NodeId | undefined;
        /** @inheritdoc */
        get origin_slot(): number | undefined;
        /**
         * Initialises a new link reroute object.
         * @param id Unique identifier for this reroute
         * @param network The network of links this reroute belongs to.  Internally converted to a WeakRef.
         * @param pos Position in graph coordinates
         * @param linkIds Link IDs ({@link LLink.id}) of all links that use this reroute
         */
        constructor(id: RerouteId, network: LinkNetwork, pos?: Point, parentId?: RerouteId, linkIds?: Iterable<LinkId>, floatingLinkIds?: Iterable<LinkId>);
        /**
         * Applies a new parentId to the reroute, and optinoally a new position and linkId.
         * Primarily used for deserialisation.
         * @param parentId The ID of the reroute prior to this reroute, or
         * `undefined` if it is the first reroute connected to a nodes output
         * @param pos The position of this reroute
         * @param linkIds All link IDs that pass through this reroute
         */
        update(parentId: RerouteId | undefined, pos?: Point, linkIds?: Iterable<LinkId>, floating?: FloatingRerouteSlot): void;
        /**
         * Validates the linkIds this reroute has.  Removes broken links.
         * @param links Collection of valid links
         * @returns true if any links remain after validation
         */
        validateLinks(links: ReadonlyMap<LinkId, LLink>, floatingLinks: ReadonlyMap<LinkId, LLink>): boolean;
        /**
         * Retrieves an ordered array of all reroutes from the node output.
         * @param visited Internal.  A set of reroutes that this function
         * has already visited whilst recursing up the chain.
         * @returns An ordered array of all reroutes from the node output to this reroute, inclusive.
         * `null` if an infinite loop is detected.
         * `undefined` if the reroute chain or {@link LinkNetwork} are invalid.
         */
        getReroutes(visited?: Set<Reroute>): Reroute[] | null;
        /**
         * Internal.  Called by {@link LLink.findNextReroute}.  Not intended for use by itself.
         * @param withParentId The rerouteId to look for
         * @param visited A set of reroutes that have already been visited
         * @returns The reroute that was found, `undefined` if no reroute was found, or `null` if an infinite loop was detected.
         */
        findNextReroute(withParentId: RerouteId, visited?: Set<Reroute>): Reroute | null | undefined;
        /**
         * Finds the output node and output slot of the first link passing through this reroute.
         * @returns The output node and output slot of the first link passing through this reroute, or `undefined` if no link is found.
         */
        findSourceOutput(): {
            node: LGraphNode;
            output: INodeOutputSlot;
        } | undefined;
        /**
         * Finds the inputs and nodes of (floating) links passing through this reroute.
         * @returns An array of objects containing the node and input slot of each link passing through this reroute.
         */
        findTargetInputs(): {
            node: LGraphNode;
            input: INodeInputSlot;
            link: LLink;
        }[] | undefined;
        /**
         * Retrieves all floating links passing through this reroute.
         * @param from Filters the links by the currently connected link side.
         * @returns An array of floating links
         */
        getFloatingLinks(from: 'input' | 'output'): LLink[] | undefined;
        /**
         * Changes the origin node/output of all floating links that pass through this reroute.
         * @param node The new origin node
         * @param output The new origin output slot
         * @param index The slot index of {@link output}
         */
        setFloatingLinkOrigin(node: LGraphNode, output: INodeOutputSlot, index: number): void;
        /** @inheritdoc */
        move(deltaX: number, deltaY: number): void;
        /** @inheritdoc */
        snapToGrid(snapTo: number): boolean;
        removeAllFloatingLinks(): void;
        removeFloatingLink(linkId: LinkId): void;
        /**
         * Removes a link or floating link from this reroute, by matching link object instance equality.
         * @param link The link to remove.
         * @remarks Does not remove the link from the network.
         */
        removeLink(link: LLink): void;
        remove(): void;
        calculateAngle(lastRenderTime: number, network: ReadonlyLinkNetwork, linkStart: Point): void;
        /**
         * Renders the reroute on the canvas.
         * @param ctx Canvas context to draw on
         * @param backgroundPattern The canvas background pattern; used to make floating reroutes appear washed out.
         * @remarks Leaves {@link ctx}.fillStyle, strokeStyle, and lineWidth dirty (perf.).
         */
        draw(ctx: CanvasRenderingContext2D, backgroundPattern?: CanvasPattern): void;
        /**
         * Draws the input and output slots on the canvas, if the slots are visible.
         * @param ctx The canvas context to draw on.
         */
        drawSlots(ctx: CanvasRenderingContext2D): void;
        drawHighlight(ctx: CanvasRenderingContext2D, colour: CanvasColour): void;
        /**
         * Updates visibility of the input and output slots, based on the position of the pointer.
         * @param pos The position of the pointer.
         * @returns `true` if any changes require a redraw.
         */
        updateVisibility(pos: Point): boolean;
        /** Prevents rendering of the input and output slots. */
        hideSlots(): void;
        /**
         * Precisely determines if {@link pos} is inside this reroute.
         * @param pos The position to check (canvas space)
         * @returns `true` if {@link pos} is within the reroute's radius.
         */
        containsPoint(pos: Point): boolean;
        private contains;
        /** @inheritdoc */
        asSerialisable(): SerialisableReroute;
    }

    export declare type RerouteId = number;

    export declare type ResolvedConnection = BaseResolvedConnection & ((ResolvedSubgraphInput & ResolvedNormalOutput) | (ResolvedNormalInput & ResolvedSubgraphOutput) | (ResolvedNormalInput & ResolvedNormalOutput));

    /**
     * The end result of resolving a DTO input.
     * When a widget value is returned, {@link widgetInfo} is present and {@link origin_slot} is `-1`.
     */
    export declare type ResolvedInput = {
        /** DTO for the node that the link originates from. */
        node: ExecutableLGraphNode;
        /** Full unique execution ID of the node that the link originates from. In the case of a widget value, this is the ID of the subgraph node. */
        origin_id: ExecutionId;
        /** The slot index of the output on the node that the link originates from. `-1` when widget value is set. */
        origin_slot: number;
        /** Boxed widget value (e.g. for widgets). If this box is `undefined`, then an input link is connected, and widget values from the subgraph node are ignored. */
        widgetInfo?: {
            value: unknown;
        };
    };

    export declare interface ResolvedNormalInput {
        inputNode: LGraphNode | undefined;
        input: INodeInputSlot | undefined;
        subgraphOutput?: undefined;
    }

    export declare interface ResolvedNormalOutput {
        outputNode: LGraphNode | undefined;
        output: INodeOutputSlot | undefined;
        subgraphInput?: undefined;
    }

    export declare interface ResolvedSubgraphInput {
        inputNode?: undefined;
        /** The actual input slot the link is connected to (mutually exclusive with {@link subgraphOutput}) */
        input?: undefined;
        subgraphOutput: SubgraphOutput;
    }

    export declare interface ResolvedSubgraphOutput {
        outputNode?: undefined;
        output?: undefined;
        subgraphInput: SubgraphInput;
    }

    /**
     * Widget for selecting from a group of buttons
     * This is a widget that only has a Vue widgets implementation
     */
    export declare class SelectButtonWidget extends BaseWidget<ISelectButtonWidget> implements ISelectButtonWidget {
        type: "selectbutton";
        drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
        onClick(_options: WidgetEventOptions): void;
    }

    /**
     * An object that implements custom pre-serialization logic via {@link Serialisable.asSerialisable}.
     */
    export declare interface Serialisable<SerialisableObject> {
        /**
         * Prepares this object for serialization.
         * Creates a partial shallow copy of itself, with only the properties that should be serialised.
         * @returns An object that can immediately be serialized to JSON.
         */
        asSerialisable(): SerialisableObject;
    }

    export declare interface SerialisableGraph extends BaseExportedGraph {
        /** Schema version.  @remarks Version bump should add to const union, which is used to narrow type during deserialise. */
        version: 0 | 1;
        state: LGraphState;
        groups?: ISerialisedGroup[];
        nodes?: ISerialisedNode[];
        links?: SerialisableLLink[];
        floatingLinks?: SerialisableLLink[];
        reroutes?: SerialisableReroute[];
        extra?: LGraphExtra;
    }

    export declare interface SerialisableLLink {
        /** Link ID */
        id: LinkId;
        /** Output node ID */
        origin_id: NodeId;
        /** Output slot index */
        origin_slot: number;
        /** Input node ID */
        target_id: NodeId;
        /** Input slot index */
        target_slot: number;
        /** Data type of the link */
        type: ISlotType;
        /** ID of the last reroute (from input to output) that this link passes through, otherwise `undefined` */
        parentId?: RerouteId;
    }

    export declare interface SerialisableReroute {
        id: RerouteId;
        parentId?: RerouteId;
        pos: Point;
        linkIds: LinkId[];
        floating?: FloatingRerouteSlot;
    }

    export declare type SerialisedLLinkArray = [
    id: LinkId,
    origin_id: NodeId,
    origin_slot: number,
    target_id: NodeId,
    target_slot: number,
    type: ISlotType
    ];

    export declare type SettingCustomRenderer = (name: string, setter: (v: unknown) => void, value: unknown, attrs?: Record<string, unknown>) => HTMLElement;

    export declare type SettingInputType = 'boolean' | 'number' | 'slider' | 'knob' | 'combo' | 'radio' | 'text' | 'image' | 'color' | 'url' | 'hidden' | 'backgroundImage';

    export declare interface SettingOption {
        text: string;
        value?: string | number;
    }

    export declare interface SettingParams<TValue = any> extends FormItem {
        id: keyof Settings_2;
        defaultValue: TValue | (() => TValue);
        defaultsByInstallVersion?: Record<`${number}.${number}.${number}`, TValue>;
        onChange?: (newValue: TValue, oldValue?: TValue) => void;
        category?: string[];
        experimental?: boolean;
        deprecated?: boolean;
        migrateDeprecatedValue?: (value: TValue) => TValue;
        versionAdded?: string;
        versionModified?: string;
        sortOrder?: number;
        hideInVueNodes?: boolean;
    }

    export { Settings }

    export export declare type SidebarTabExtension = VueSidebarTabExtension | CustomSidebarTabExtension;

    /** Keys (names) of API events that _do not_ pass a {@link CustomEvent} `detail` object. */
    export declare type SimpleApiEvents = keyof PickNevers_2<ApiEventTypes>;

    /** A size represented as `[width, height]` */
    export declare type Size = [width: number, height: number];

    export declare class SliderWidget extends BaseWidget<ISliderWidget> implements ISliderWidget {
        type: "slider";
        marker?: number;
        /**
         * Draws the widget
         * @param ctx The canvas context
         * @param options The options for drawing the widget
         */
        drawWidget(ctx: CanvasRenderingContext2D, { width, showText }: DrawWidgetOptions): void;
        /**
         * Handles click events for the slider widget
         */
        onClick(options: WidgetEventOptions): void;
        /**
         * Handles drag events for the slider widget
         */
        onDrag(options: WidgetEventOptions): false | undefined;
    }

    /** Base class for all input & output slots. */
    export declare abstract class SlotBase implements INodeSlot {
        name: string;
        localized_name?: string;
        label?: string;
        type: ISlotType;
        dir?: LinkDirection;
        removable?: boolean;
        shape?: RenderShape;
        color_off?: CanvasColour;
        color_on?: CanvasColour;
        locked?: boolean;
        nameLocked?: boolean;
        widget?: IWidgetLocator;
        _floatingLinks?: Set<LLink>;
        hasErrors?: boolean;
        /** The centre point of the slot. */
        abstract pos?: Point;
        readonly boundingRect: Rectangle;
        constructor(name: string, type: ISlotType, boundingRect?: Rectangle);
        abstract get isConnected(): boolean;
        renderingColor(colorContext: DefaultConnectionColors): CanvasColour;
    }

    /** @see LinkDirection */
    export declare enum SlotDirection {
    }

    /** @see RenderShape */
    export declare enum SlotShape {
        Box = 1,
        Arrow = 5,
        Grid = 6,
        Circle = 3,
        HollowCircle = 7
    }

    export declare enum SlotType {
        Array = "array",
        Event = -1
    }

    /** A subgraph definition. */
    export declare class Subgraph extends LGraph implements BaseLGraph, Serialisable<ExportedSubgraph> {
        #private;
        readonly events: CustomEventTarget<SubgraphEventMap, "configuring" | "configured" | "subgraph-created" | "convert-to-subgraph" | "open-subgraph" | "adding-input" | "adding-output" | "input-added" | "output-added" | "removing-input" | "removing-output" | "renaming-input" | "renaming-output" | "widget-promoted" | "widget-demoted">;
        /** Limits the number of levels / depth that subgraphs may be nested.  Prevents uncontrolled programmatic nesting. */
        static MAX_NESTED_SUBGRAPHS: number;
        /** The display name of the subgraph. */
        name: string;
        readonly inputNode: SubgraphInputNode;
        readonly outputNode: SubgraphOutputNode;
        /** Ordered list of inputs to the subgraph itself. Similar to a reroute, with the input side in the graph, and the output side in the subgraph. */
        readonly inputs: SubgraphInput[];
        /** Ordered list of outputs from the subgraph itself. Similar to a reroute, with the input side in the subgraph, and the output side in the graph. */
        readonly outputs: SubgraphOutput[];
        /** A list of node widgets displayed in the parent graph, on the subgraph object. */
        readonly widgets: ExposedWidget[];
        get rootGraph(): LGraph;
        constructor(rootGraph: LGraph, data: ExportedSubgraph);
        getIoNodeOnPos(x: number, y: number): SubgraphInputNode | SubgraphOutputNode | undefined;
        configure(data: (ISerialisedGraph & ExportedSubgraph) | (SerialisableGraph & ExportedSubgraph), keep_old?: boolean): boolean | undefined;
        attachCanvas(canvas: LGraphCanvas): void;
        addInput(name: string, type: string): SubgraphInput;
        addOutput(name: string, type: string): SubgraphOutput;
        /**
         * Renames an input slot in the subgraph.
         * @param input The input slot to rename.
         * @param name The new name for the input slot.
         */
        renameInput(input: SubgraphInput, name: string): void;
        /**
         * Renames an output slot in the subgraph.
         * @param output The output slot to rename.
         * @param name The new name for the output slot.
         */
        renameOutput(output: SubgraphOutput, name: string): void;
        /**
         * Removes an input slot from the subgraph.
         * @param input The input slot to remove.
         */
        removeInput(input: SubgraphInput): void;
        /**
         * Removes an output slot from the subgraph.
         * @param output The output slot to remove.
         */
        removeOutput(output: SubgraphOutput): void;
        draw(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void;
        /**
         * Clones the subgraph, creating an identical copy with a new ID.
         * @returns A new subgraph with the same configuration, but a new ID.
         */
        clone(keepId?: boolean): Subgraph;
        asSerialisable(): ExportedSubgraph & Required<Pick<SerialisableGraph, 'nodes' | 'groups' | 'extra'>>;
    }

    export declare interface SubgraphEventMap extends LGraphEventMap {
        'adding-input': {
            name: string;
            type: string;
        };
        'adding-output': {
            name: string;
            type: string;
        };
        'input-added': {
            input: SubgraphInput;
        };
        'output-added': {
            output: SubgraphOutput;
        };
        'removing-input': {
            input: SubgraphInput;
            index: number;
        };
        'removing-output': {
            output: SubgraphOutput;
            index: number;
        };
        'renaming-input': {
            input: SubgraphInput;
            index: number;
            oldName: string;
            newName: string;
        };
        'renaming-output': {
            output: SubgraphOutput;
            index: number;
            oldName: string;
            newName: string;
        };
        'widget-promoted': {
            widget: IBaseWidget;
            subgraphNode: SubgraphNode;
        };
        'widget-demoted': {
            widget: IBaseWidget;
            subgraphNode: SubgraphNode;
        };
    }

    /**
     * An input "slot" from a parent graph into a subgraph.
     *
     * IMPORTANT: A subgraph "input" is both an input AND an output.  It creates an extra link connection point between
     * a parent graph and a subgraph, so is conceptually similar to a reroute.
     *
     * This can be a little confusing, but is easier to visualise when imagining editing a subgraph.
     * You have "Subgraph Inputs", because they are coming into the subgraph, which then connect to "node inputs".
     *
     * Functionally, however, when editing a subgraph, that "subgraph input" is the "origin" or "output side" of a link.
     */
    export declare class SubgraphInput extends SubgraphSlot {
        #private;
        parent: SubgraphInputNode;
        events: CustomEventTarget<SubgraphInputEventMap, "input-connected" | "input-disconnected" | "configuring" | "configured" | "subgraph-created" | "convert-to-subgraph" | "open-subgraph">;
        get _widget(): IBaseWidget<string | number | boolean | object | undefined, string, IWidgetOptions<unknown>> | undefined;
        set _widget(widget: IBaseWidget<string | number | boolean | object | undefined, string, IWidgetOptions<unknown>> | undefined);
        connect(slot: INodeInputSlot, node: LGraphNode, afterRerouteId?: RerouteId): LLink | undefined;
        get labelPos(): Point;
        getConnectedWidgets(): IBaseWidget[];
        /**
         * Validates that the connection between the new slot and the existing widget is valid.
         * Used to prevent connections between widgets that are not of the same type.
         * @param otherWidget The widget to compare to.
         * @returns `true` if the connection is valid, otherwise `false`.
         */
        matchesWidget(otherWidget: IBaseWidget): boolean;
        disconnect(): void;
        /** For inputs, x is the right edge of the input node. */
        arrange(rect: ReadOnlyRect): void;
        /**
         * Checks if this slot is a valid target for a connection from the given slot.
         * For SubgraphInput (which acts as an output inside the subgraph),
         * the fromSlot should be an input slot.
         */
        isValidTarget(fromSlot: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput): boolean;
    }

    export declare interface SubgraphInputEventMap extends LGraphEventMap {
        'input-connected': {
            input: INodeInputSlot;
            widget: IBaseWidget;
        };
        'input-disconnected': {
            input: SubgraphInput;
        };
    }

    export declare class SubgraphInputNode extends SubgraphIONodeBase<SubgraphInput> implements Positionable {
        readonly id: NodeId;
        readonly emptySlot: EmptySubgraphInput;
        get slots(): SubgraphInput[];
        get allSlots(): SubgraphInput[];
        get slotAnchorX(): number;
        onPointerDown(e: CanvasPointerEvent, pointer: CanvasPointer, linkConnector: LinkConnector): void;
        /** @inheritdoc */
        renameSlot(slot: SubgraphInput, name: string): void;
        /** @inheritdoc */
        removeSlot(slot: SubgraphInput): void;
        canConnectTo(inputNode: NodeLike, input: INodeInputSlot, fromSlot: SubgraphInput): boolean;
        connectSlots(fromSlot: SubgraphInput, inputNode: LGraphNode, input: INodeInputSlot, afterRerouteId: RerouteId | undefined): LLink;
        connectByType(slot: number, target_node: LGraphNode, target_slotType: ISlotType, optsIn?: {
            afterRerouteId?: RerouteId;
        }): LLink | undefined;
        findOutputSlot(name: string): SubgraphInput | undefined;
        findOutputByType(type: ISlotType): SubgraphInput | undefined;
        _disconnectNodeInput(node: LGraphNode, input: INodeInputSlot, link: LLink | undefined): void;
        drawProtected(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void;
    }

    /** Subgraph I/O slots */
    export declare interface SubgraphIO extends SubgraphIOShared {
        /** Slot ID (internal; never changes once instantiated). */
        id: UUID;
        /** The data type this slot uses. Unlike nodes, this does not support legacy numeric types. */
        type: string;
        /** Links connected to this slot, or `undefined` if not connected. An output slot should only ever have one link. */
        linkIds?: LinkId[];
    }

    export declare abstract class SubgraphIONodeBase<TSlot extends SubgraphInput | SubgraphOutput> implements Positionable, Hoverable, Serialisable<ExportedSubgraphIONode> {
        #private;
        /** The subgraph that this node belongs to. */
        readonly subgraph: Subgraph;
        static margin: number;
        static minWidth: number;
        static roundedRadius: number;
        abstract readonly id: NodeId;
        get boundingRect(): Rectangle;
        selected: boolean;
        pinned: boolean;
        readonly removable = false;
        isPointerOver: boolean;
        abstract readonly emptySlot: EmptySubgraphInput | EmptySubgraphOutput;
        get pos(): Point;
        set pos(value: Point);
        get size(): Size;
        set size(value: Size);
        protected get sideLineWidth(): number;
        protected get sideStrokeStyle(): CanvasColour;
        abstract readonly slots: TSlot[];
        abstract get allSlots(): TSlot[];
        constructor(
        /** The subgraph that this node belongs to. */
        subgraph: Subgraph);
        move(deltaX: number, deltaY: number): void;
        /** @inheritdoc */
        snapToGrid(snapTo: number): boolean;
        abstract onPointerDown(e: CanvasPointerEvent, pointer: CanvasPointer, linkConnector: LinkConnector): void;
        containsPoint(point: Point): boolean;
        abstract get slotAnchorX(): number;
        onPointerMove(e: CanvasPointerEvent): CanvasItem;
        onPointerEnter(): void;
        onPointerLeave(): void;
        /**
         * Renames an IO slot in the subgraph.
         * @param slot The slot to rename.
         * @param name The new name for the slot.
         */
        abstract renameSlot(slot: TSlot, name: string): void;
        /**
         * Removes an IO slot from the subgraph.
         * @param slot The slot to remove.
         */
        abstract removeSlot(slot: TSlot): void;
        /**
         * Gets the slot at a given position in canvas space.
         * @param x The x coordinate of the position.
         * @param y The y coordinate of the position.
         * @returns The slot at the given position, otherwise `undefined`.
         */
        getSlotInPosition(x: number, y: number): TSlot | undefined;
        /**
         * Handles double-click on an IO slot to rename it.
         * @param slot The slot that was double-clicked.
         * @param event The event that triggered the double-click.
         */
        protected handleSlotDoubleClick(slot: TSlot, event: CanvasPointerEvent): void;
        /**
         * Shows the context menu for an IO slot.
         * @param slot The slot to show the context menu for.
         * @param event The event that triggered the context menu.
         */
        protected showSlotContextMenu(slot: TSlot, event: CanvasPointerEvent): void;
        /** Arrange the slots in this node. */
        arrange(): void;
        draw(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void;
        /* Excluded from this release type: drawProtected */
        /* Excluded from this release type: drawSlots */
        configure(data: ExportedSubgraphIONode): void;
        asSerialisable(): ExportedSubgraphIONode;
    }

    /** Properties shared by subgraph and node I/O slots. */
    export declare type SubgraphIOShared = Omit<INodeSlot, 'boundingRect' | 'nameLocked' | 'locked' | 'removable' | '_floatingLinks'>;

    /**
     * An instance of a {@link Subgraph}, displayed as a node on the containing (parent) graph.
     */
    export declare class SubgraphNode extends LGraphNode implements BaseLGraph {
        #private;
        /** The (sub)graph that contains this subgraph instance. */
        readonly graph: GraphOrSubgraph;
        /** The definition of this subgraph; how its nodes are configured, etc. */
        readonly subgraph: Subgraph;
        inputs: (INodeInputSlot & Partial<ISubgraphInput>)[];
        readonly type: UUID;
        readonly isVirtualNode: true;
        get rootGraph(): LGraph;
        get displayType(): string;
        isSubgraphNode(): this is SubgraphNode;
        widgets: IBaseWidget[];
        constructor(
        /** The (sub)graph that contains this subgraph instance. */
        graph: GraphOrSubgraph,
        /** The definition of this subgraph; how its nodes are configured, etc. */
        subgraph: Subgraph, instanceData: ExportedSubgraphInstance);
        onTitleButtonClick(button: LGraphButton, canvas: LGraphCanvas): void;
        configure(info: ExportedSubgraphInstance): void;
        _internalConfigureAfterSlots(): void;
        /**
         * Ensures the subgraph slot is in the params before adding the input as normal.
         * @param name The name of the input slot.
         * @param type The type of the input slot.
         * @param inputProperties Properties that are directly assigned to the created input. Default: a new, empty object.
         * @returns The new input slot.
         * @remarks Assertion is required to instantiate empty generic POJO.
         */
        addInput<TInput extends Partial<ISubgraphInput>>(name: string, type: ISlotType, inputProperties?: TInput): INodeInputSlot & TInput;
        getInputLink(slot: number): LLink | null;
        /**
         * Finds the internal links connected to the given input slot inside the subgraph, and resolves the nodes / slots.
         * @param slot The slot index
         * @returns The resolved connections, or undefined if no input node is found.
         * @remarks This is used to resolve the input links when dragging a link from a subgraph input slot.
         */
        resolveSubgraphInputLinks(slot: number): ResolvedConnection[];
        /**
         * Finds the internal link connected to the given output slot inside the subgraph, and resolves the nodes / slots.
         * @param slot The slot index
         * @returns The output node if found, otherwise undefined.
         */
        resolveSubgraphOutputLink(slot: number): ResolvedConnection | undefined;
        /* Excluded from this release type: getInnerNodes */
        removeWidgetByName(name: string): void;
        ensureWidgetRemoved(widget: IBaseWidget): void;
        onRemoved(): void;
        drawTitleBox(ctx: CanvasRenderingContext2D, { scale, low_quality, title_height, box_size }: DrawTitleBoxOptions): void;
        /**
         * Synchronizes widget values from this SubgraphNode instance to the
         * corresponding widgets in the subgraph definition before serialization.
         * This ensures nested subgraph widget values are preserved when saving.
         */
        serialize(): ISerialisedNode;
        clone(): LGraphNode | null;
    }

    /**
     * An output "slot" from a subgraph to a parent graph.
     *
     * IMPORTANT: A subgraph "output" is both an output AND an input.  It creates an extra link connection point between
     * a parent graph and a subgraph, so is conceptually similar to a reroute.
     *
     * This can be a little confusing, but is easier to visualise when imagining editing a subgraph.
     * You have "Subgraph Outputs", because they go from inside the subgraph and out, but links to them come from "node outputs".
     *
     * Functionally, however, when editing a subgraph, that "subgraph output" is the "target" or "input side" of a link.
     */
    export declare class SubgraphOutput extends SubgraphSlot {
        parent: SubgraphOutputNode;
        connect(slot: INodeOutputSlot, node: LGraphNode, afterRerouteId?: RerouteId): LLink | undefined;
        get labelPos(): Point;
        arrange(rect: ReadOnlyRect): void;
        /**
         * Checks if this slot is a valid target for a connection from the given slot.
         * For SubgraphOutput (which acts as an input inside the subgraph),
         * the fromSlot should be an output slot.
         */
        isValidTarget(fromSlot: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput): boolean;
        disconnect(): void;
    }

    export declare class SubgraphOutputNode extends SubgraphIONodeBase<SubgraphOutput> implements Positionable {
        readonly id: NodeId;
        readonly emptySlot: EmptySubgraphOutput;
        get slots(): SubgraphOutput[];
        get allSlots(): SubgraphOutput[];
        get slotAnchorX(): number;
        onPointerDown(e: CanvasPointerEvent, pointer: CanvasPointer, linkConnector: LinkConnector): void;
        /** @inheritdoc */
        renameSlot(slot: SubgraphOutput, name: string): void;
        /** @inheritdoc */
        removeSlot(slot: SubgraphOutput): void;
        canConnectTo(outputNode: NodeLike, fromSlot: SubgraphOutput, output: INodeOutputSlot | SubgraphIO): boolean;
        connectByTypeOutput(slot: number, target_node: LGraphNode, target_slotType: ISlotType, optsIn?: {
            afterRerouteId?: RerouteId;
        }): LLink | undefined;
        findInputByType(type: ISlotType): SubgraphOutput | undefined;
        drawProtected(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void;
    }

    /** Shared base class for the slots used on Subgraph . */
    export declare abstract class SubgraphSlot extends SlotBase implements SubgraphIO, Hoverable, Serialisable<SubgraphIO> {
        #private;
        static get defaultHeight(): number;
        readonly measurement: ConstrainedSize;
        readonly id: UUID;
        readonly parent: SubgraphInputNode | SubgraphOutputNode;
        type: string;
        readonly linkIds: LinkId[];
        readonly boundingRect: Rectangle;
        get pos(): Point;
        set pos(value: Point);
        /** Whether this slot is connected to another slot. */
        get isConnected(): boolean;
        /** The display name of this slot. */
        get displayName(): string;
        abstract get labelPos(): Point;
        constructor(slot: SubgraphIO, parent: SubgraphInputNode | SubgraphOutputNode);
        isPointerOver: boolean;
        containsPoint(point: Point): boolean;
        onPointerMove(e: CanvasPointerEvent): void;
        getLinks(): LLink[];
        decrementSlots(inputsOrOutputs: 'inputs' | 'outputs'): void;
        measure(): Readonly<Size>;
        abstract arrange(rect: ReadOnlyRect): void;
        abstract connect(slot: INodeInputSlot | INodeOutputSlot, node: LGraphNode, afterRerouteId?: RerouteId): LLink | undefined;
        /**
         * Disconnects all links connected to this slot.
         */
        disconnect(): void;
        /**
         * Checks if this slot is a valid target for a connection from the given slot.
         * @param fromSlot The slot that is being dragged to connect to this slot.
         * @returns true if the connection is valid, false otherwise.
         */
        abstract isValidTarget(fromSlot: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput): boolean;
        /** @remarks Leaves the context dirty. */
        draw({ ctx, colorContext, lowQuality, fromSlot, editorAlpha }: SubgraphSlotDrawOptions): void;
        asSerialisable(): SubgraphIO;
    }

    export declare interface SubgraphSlotDrawOptions {
        ctx: CanvasRenderingContext2D;
        colorContext: DefaultConnectionColors;
        lowQuality?: boolean;
        fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput;
        editorAlpha?: number;
    }

    export { SystemStats }

    export declare interface TemplateInfo {
        name: string;
        /**
         * Optional title which is used as the fallback if the name is not in the locales dictionary.
         */
        title?: string;
        tutorialUrl?: string;
        mediaType: string;
        mediaSubtype: string;
        thumbnailVariant?: string;
        description: string;
        localizedTitle?: string;
        localizedDescription?: string;
        isEssential?: boolean;
        sourceModule?: string;
        tags?: string[];
        models?: string[];
        date?: string;
        useCase?: string;
        license?: string;
        /**
         * Estimated VRAM requirement in bytes.
         */
        vram?: number;
        size?: number;
        /**
         * Whether this template uses open source models. When false, indicates partner/API node templates.
         */
        openSource?: boolean;
        /**
         * Array of custom node package IDs required for this template (from Custom Node Registry).
         * Templates with this field will be hidden on local installations temporarily.
         */
        requiresCustomNodes?: string[];
    }

    export { TerminalSize }

    /**
     * Widget for multi-line text input
     * This is a widget that only has a Vue widgets implementation
     */
    export declare class TextareaWidget extends BaseWidget<ITextareaWidget> implements ITextareaWidget {
        type: "textarea";
        drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
        onClick(_options: WidgetEventOptions): void;
    }

    export declare class TextWidget extends BaseWidget<IStringWidget> implements IStringWidget {
        constructor(widget: IStringWidget, node: LGraphNode);
        /**
         * Draws the widget
         * @param ctx The canvas context
         * @param options The options for drawing the widget
         */
        drawWidget(ctx: CanvasRenderingContext2D, { width, showText }: DrawWidgetOptions): void;
        onClick({ e, node, canvas }: WidgetEventOptions): void;
    }

    export declare enum TitleMode {
        NORMAL_TITLE = 0,
        NO_TITLE = 1,
        TRANSPARENT_TITLE = 2,
        AUTOHIDE_TITLE = 3
    }

    export export declare type ToastManager = {
        add(message: ToastMessageOptions): void;
        remove(message: ToastMessageOptions): void;
        removeAll(): void;
    };

    /**
     * Defines message options in Toast component.
     */
    export export declare interface ToastMessageOptions {
        /**
         * Severity level of the message.
         * @defaultValue info
         */
        severity?: 'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast' | undefined;
        /**
         * Summary content of the message.
         */
        summary?: string | undefined;
        /**
         * Detail content of the message.
         */
        detail?: string;
        /**
         * Whether the message can be closed manually using the close icon.
         * @defaultValue true
         */
        closable?: boolean | undefined;
        /**
         * Delay in milliseconds to close the message automatically.
         */
        life?: number | undefined;
        /**
         * Key of the Toast to display the message.
         */
        group?: string | undefined;
        /**
         * Style class of the message.
         */
        styleClass?: string | string[] | Record<string, boolean>;
        /**
         * Style class of the content.
         * Matches PrimeVue Toast API which accepts Vue class bindings.
         */
        contentStyleClass?: string | string[] | Record<string, boolean>;
    }

    /** Connecting TO an input slot. */
    export declare class ToInputFromIoNodeLink implements RenderLink {
        readonly network: LinkNetwork;
        readonly node: SubgraphInputNode;
        readonly fromSlot: SubgraphInput;
        readonly fromReroute?: Reroute | undefined;
        dragDirection: LinkDirection;
        readonly toType = "input";
        readonly fromSlotIndex: number;
        readonly fromPos: Point;
        fromDirection: LinkDirection;
        readonly existingLink?: LLink;
        constructor(network: LinkNetwork, node: SubgraphInputNode, fromSlot: SubgraphInput, fromReroute?: Reroute | undefined, dragDirection?: LinkDirection, existingLink?: LLink);
        canConnectToInput(inputNode: NodeLike, input: INodeInputSlot): boolean;
        canConnectToOutput(): false;
        connectToInput(node: LGraphNode, input: INodeInputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToSubgraphOutput(): void;
        connectToRerouteInput(reroute: Reroute, { node: inputNode, input, link }: {
            node: LGraphNode;
            input: INodeInputSlot;
            link: LLink;
        }, events: CustomEventTarget<LinkConnectorEventMap>, originalReroutes: Reroute[]): void;
        connectToOutput(): void;
        connectToSubgraphInput(): void;
        connectToRerouteOutput(): void;
        disconnect(): boolean;
    }

    /** Connecting TO an input slot. */
    export declare class ToInputRenderLink implements RenderLink {
        readonly network: LinkNetwork;
        readonly node: LGraphNode;
        readonly fromSlot: INodeOutputSlot;
        readonly fromReroute?: Reroute | undefined;
        dragDirection: LinkDirection;
        readonly toType = "input";
        readonly fromPos: Point;
        readonly fromSlotIndex: number;
        fromDirection: LinkDirection;
        constructor(network: LinkNetwork, node: LGraphNode, fromSlot: INodeOutputSlot, fromReroute?: Reroute | undefined, dragDirection?: LinkDirection);
        canConnectToInput(inputNode: NodeLike, input: INodeInputSlot): boolean;
        canConnectToOutput(): false;
        connectToInput(node: LGraphNode, input: INodeInputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToSubgraphOutput(output: SubgraphOutput, events: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToRerouteInput(reroute: Reroute, { node: inputNode, input, link }: {
            node: LGraphNode;
            input: INodeInputSlot;
            link: LLink;
        }, events: CustomEventTarget<LinkConnectorEventMap>, originalReroutes: Reroute[]): void;
        connectToOutput(): void;
        connectToSubgraphInput(): void;
        connectToRerouteOutput(): void;
    }

    /** Connecting TO an output slot. */
    export declare class ToOutputFromIoNodeLink implements RenderLink {
        readonly network: LinkNetwork;
        readonly node: SubgraphOutputNode;
        readonly fromSlot: SubgraphOutput;
        readonly fromReroute?: Reroute | undefined;
        dragDirection: LinkDirection;
        readonly toType = "output";
        readonly fromPos: Point;
        readonly fromSlotIndex: number;
        fromDirection: LinkDirection;
        constructor(network: LinkNetwork, node: SubgraphOutputNode, fromSlot: SubgraphOutput, fromReroute?: Reroute | undefined, dragDirection?: LinkDirection);
        canConnectToInput(): false;
        canConnectToOutput(outputNode: NodeLike, output: INodeOutputSlot | SubgraphIO): boolean;
        canConnectToReroute(reroute: Reroute): boolean;
        connectToOutput(node: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToSubgraphInput(): void;
        connectToRerouteOutput(reroute: Reroute, outputNode: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToInput(): void;
        connectToSubgraphOutput(): void;
        connectToRerouteInput(): void;
    }

    /** Connecting TO an output slot. */
    export declare class ToOutputRenderLink implements RenderLink {
        readonly network: LinkNetwork;
        readonly node: LGraphNode;
        readonly fromSlot: INodeInputSlot;
        readonly fromReroute?: Reroute | undefined;
        dragDirection: LinkDirection;
        readonly toType = "output";
        readonly fromPos: Point;
        readonly fromSlotIndex: number;
        fromDirection: LinkDirection;
        constructor(network: LinkNetwork, node: LGraphNode, fromSlot: INodeInputSlot, fromReroute?: Reroute | undefined, dragDirection?: LinkDirection);
        canConnectToInput(): false;
        canConnectToOutput(outputNode: NodeLike, output: INodeOutputSlot | SubgraphIO): boolean;
        canConnectToReroute(reroute: Reroute): boolean;
        canConnectToSubgraphInput(input: SubgraphInput): boolean;
        connectToOutput(node: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToSubgraphInput(input: SubgraphInput, events?: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToRerouteOutput(reroute: Reroute, outputNode: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void;
        connectToInput(): void;
        connectToSubgraphOutput(): void;
        connectToRerouteInput(): void;
    }

    export declare interface TopbarBadge {
        text: string;
        /**
         * Optional badge label (e.g., "BETA", "ALPHA", "NEW")
         */
        label?: string;
        /**
         * Visual variant for the badge
         * - info: Default informational badge (white label, gray background)
         * - warning: Warning badge (orange theme, higher emphasis)
         * - error: Error/alert badge (red theme, highest emphasis)
         */
        variant?: 'info' | 'warning' | 'error';
        /**
         * Optional icon class (e.g., "pi-exclamation-triangle")
         * If not provided, variant will determine the default icon
         */
        icon?: string;
        /**
         * Optional tooltip text to show on hover
         */
        tooltip?: string;
    }

    /**
     * Widget for hierarchical tree selection
     * This is a widget that only has a Vue widgets implementation
     */
    export declare class TreeSelectWidget extends BaseWidget<ITreeSelectWidget> implements ITreeSelectWidget {
        type: "treeselect";
        drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void;
        onClick(_options: WidgetEventOptions): void;
    }

    /**
     * Valid widget types.  TS cannot provide easily extensible type safety for this at present.
     * Override linkedWidgets[]
     * Values not in this list will not result in litegraph errors, however they will be treated the same as "custom".
     */
    export declare type TWidgetType = IWidget['type'];

    export declare type TWidgetValue = IWidget['value'];

    export { User }

    export { UserData }

    export { UserDataFullInfo }

    /**
     * Represents a file in the user's data directory.
     */
    export declare class UserFile {
        /**
         * Path relative to ComfyUI/user/ directory.
         */
        path: string;
        /**
         * Last modified timestamp.
         */
        lastModified: number;
        /**
         * File size in bytes. -1 for temporary files.
         */
        size: number;
        /**
         * Various path components.
         * Example:
         * - path: 'dir/file.txt'
         * - directory: 'dir'
         * - fullFilename: 'file.txt'
         * - filename: 'file'
         * - suffix: 'txt'
         */
        directory: string;
        fullFilename: string;
        filename: string;
        suffix: string | null;
        isLoading: boolean;
        content: string | null;
        originalContent: string | null;
        constructor(
        /**
         * Path relative to ComfyUI/user/ directory.
         */
        path: string,
        /**
         * Last modified timestamp.
         */
        lastModified: number,
        /**
         * File size in bytes. -1 for temporary files.
         */
        size: number);
        updatePath(newPath: string): void;
        static createTemporary(path: string): UserFile;
        get isTemporary(): boolean;
        get isPersisted(): boolean;
        get key(): string;
        get isLoaded(): boolean;
        get isModified(): boolean;
        /**
         * Loads the file content from the remote storage.
         */
        load({ force }?: {
            force?: boolean;
        }): Promise<LoadedUserFile>;
        /**
         * Unloads the file content from memory
         */
        unload(): void;
        saveAs(newPath: string): Promise<UserFile>;
        /**
         * Saves the file to the remote storage.
         * @param force Whether to force the save even if the file is not modified.
         */
        save({ force }?: {
            force?: boolean;
        }): Promise<UserFile>;
        delete(): Promise<void>;
        rename(newPath: string): Promise<UserFile>;
    }

    export declare type UUID = string;

    /** @deprecated Use {@link Point} instead. */
    export declare type Vector2 = Point;

    export declare type VueBottomPanelExtension = BaseBottomPanelExtension & VueExtension;

    export declare interface VueExtension {
        id: string;
        type: 'vue';
        component: Component;
    }

    export declare type VueSidebarTabExtension = BaseSidebarTabExtension & VueExtension;

    /**
     * If {@link T} is `null` or `undefined`, evaluates to {@link Result}. Otherwise, evaluates to {@link T}.
     * Useful for functions that return e.g. `undefined` when a param is nullish.
     */
    export declare type WhenNullish<T, Result> = (T & {}) | (T extends null ? Result : T extends undefined ? Result : T & {});

    export declare interface WidgetEventOptions {
        e: CanvasPointerEvent;
        node: LGraphNode;
        canvas: LGraphCanvas;
    }

    export declare type Widgets = Record<string, ComfyWidgetConstructor>;

    export declare type WidgetTypeMap = {
        button: ButtonWidget;
        toggle: BooleanWidget;
        slider: SliderWidget;
        knob: KnobWidget;
        combo: ComboWidget;
        number: NumberWidget;
        string: TextWidget;
        text: TextWidget;
        custom: LegacyWidget;
        fileupload: FileUploadWidget;
        color: ColorWidget;
        markdown: MarkdownWidget;
        treeselect: TreeSelectWidget;
        multiselect: MultiSelectWidget;
        chart: ChartWidget;
        galleria: GalleriaWidget;
        imagecompare: ImageCompareWidget;
        selectbutton: SelectButtonWidget;
        textarea: TextareaWidget;
        asset: AssetWidget;
        [key: string]: BaseWidget;
    };

    /**
     * Workflow import metadata
     */
    export declare interface WorkflowImportMetadata {
        missing_node_count: number;
        missing_node_types: string[];
        /**
         * The source of the workflow open/import action
         */
        open_source?: 'file_button' | 'file_drop' | 'template' | 'unknown';
    }

    /**
     * Workflow open metadata
     */
    /**
     * Enumerated sources for workflow open/import actions.
     */
    export declare type WorkflowOpenSource = NonNullable<WorkflowImportMetadata['open_source']>;

    export declare interface WorkflowTemplates {
        moduleName: string;
        templates: TemplateInfo[];
        title: string;
        localizedTitle?: string;
        category?: string;
        type?: string;
        icon?: string;
        isEssential?: boolean;
    }

    export declare const zComfyNodeDef: z.ZodObject<{
        input: z.ZodOptional<z.ZodObject<{
            required: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodTuple<[z.ZodLiteral<"INT">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"FLOAT">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"BOOLEAN">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"STRING">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"COMBO">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodEffects<z.ZodString, string, string>, z.ZodOptional<z.ZodObject<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>], null>]>>>;
            optional: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodTuple<[z.ZodLiteral<"INT">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"FLOAT">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"BOOLEAN">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"STRING">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"COMBO">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodEffects<z.ZodString, string, string>, z.ZodOptional<z.ZodObject<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough">>>], null>]>>>;
            hidden: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            hidden?: Record<string, any> | undefined;
            required?: Record<string, ["INT", z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["FLOAT", z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["BOOLEAN", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["STRING", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [(string | number)[], z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["COMBO", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [string, z.objectOutputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough"> | undefined]> | undefined;
            optional?: Record<string, ["INT", z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["FLOAT", z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["BOOLEAN", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["STRING", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [(string | number)[], z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["COMBO", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [string, z.objectOutputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough"> | undefined]> | undefined;
        }, {
            hidden?: Record<string, any> | undefined;
            required?: Record<string, ["INT", z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["FLOAT", z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["BOOLEAN", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["STRING", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [(string | number)[], z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["COMBO", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [string, z.objectInputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough"> | undefined]> | undefined;
            optional?: Record<string, ["INT", z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["FLOAT", z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["BOOLEAN", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["STRING", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [(string | number)[], z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["COMBO", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [string, z.objectInputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough"> | undefined]> | undefined;
        }>>;
        output: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">]>, "many">>;
        output_is_list: z.ZodOptional<z.ZodArray<z.ZodBoolean, "many">>;
        output_name: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        output_tooltips: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        output_matchtypes: z.ZodOptional<z.ZodArray<z.ZodOptional<z.ZodString>, "many">>;
        name: z.ZodString;
        display_name: z.ZodString;
        description: z.ZodString;
        help: z.ZodOptional<z.ZodString>;
        category: z.ZodString;
        output_node: z.ZodBoolean;
        python_module: z.ZodString;
        deprecated: z.ZodOptional<z.ZodBoolean>;
        experimental: z.ZodOptional<z.ZodBoolean>;
        /**
         * Whether the node is an API node. Running API nodes requires login to
         * Comfy Org account.
         * https://docs.comfy.org/tutorials/api-nodes/overview
         */
        api_node: z.ZodOptional<z.ZodBoolean>;
        /**
         * Specifies the order of inputs for each input category.
         * Used to ensure consistent widget ordering regardless of JSON serialization.
         * Keys are 'required', 'optional', etc., values are arrays of input names.
         */
        input_order: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        display_name: string;
        category: string;
        output_node: boolean;
        python_module: string;
        input?: {
            hidden?: Record<string, any> | undefined;
            required?: Record<string, ["INT", z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["FLOAT", z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["BOOLEAN", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["STRING", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [(string | number)[], z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["COMBO", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [string, z.objectOutputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough"> | undefined]> | undefined;
            optional?: Record<string, ["INT", z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["FLOAT", z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["BOOLEAN", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["STRING", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [(string | number)[], z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["COMBO", z.objectOutputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [string, z.objectOutputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough"> | undefined]> | undefined;
        } | undefined;
        output?: (string | (string | number)[])[] | undefined;
        output_is_list?: boolean[] | undefined;
        output_name?: string[] | undefined;
        output_tooltips?: string[] | undefined;
        output_matchtypes?: (string | undefined)[] | undefined;
        help?: string | undefined;
        deprecated?: boolean | undefined;
        experimental?: boolean | undefined;
        api_node?: boolean | undefined;
        input_order?: Record<string, string[]> | undefined;
    }, {
        name: string;
        description: string;
        display_name: string;
        category: string;
        output_node: boolean;
        python_module: string;
        input?: {
            hidden?: Record<string, any> | undefined;
            required?: Record<string, ["INT", z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["FLOAT", z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["BOOLEAN", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["STRING", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [(string | number)[], z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["COMBO", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [string, z.objectInputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough"> | undefined]> | undefined;
            optional?: Record<string, ["INT", z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                /**
                 * If true, a linked widget will be added to the node to select the mode
                 * of `control_after_generate`.
                 */
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["FLOAT", z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
                default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
                display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
            }>, {
                round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["BOOLEAN", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                label_on: z.ZodOptional<z.ZodString>;
                label_off: z.ZodOptional<z.ZodString>;
                default: z.ZodOptional<z.ZodBoolean>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["STRING", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                default: z.ZodOptional<z.ZodString>;
                multiline: z.ZodOptional<z.ZodBoolean>;
                dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
                defaultVal: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [(string | number)[], z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | ["COMBO", z.objectInputType<z.objectUtil.extendShape<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, {
                control_after_generate: z.ZodOptional<z.ZodBoolean>;
                image_upload: z.ZodOptional<z.ZodBoolean>;
                image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
                allow_batch: z.ZodOptional<z.ZodBoolean>;
                video_upload: z.ZodOptional<z.ZodBoolean>;
                audio_upload: z.ZodOptional<z.ZodBoolean>;
                animated_image_upload: z.ZodOptional<z.ZodBoolean>;
                options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                remote: z.ZodOptional<z.ZodObject<{
                    route: z.ZodUnion<[z.ZodString, z.ZodString]>;
                    refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
                    response_key: z.ZodOptional<z.ZodString>;
                    query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                    refresh_button: z.ZodOptional<z.ZodBoolean>;
                    control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
                    timeout: z.ZodOptional<z.ZodNumber>;
                    max_retries: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }, {
                    route: string;
                    refresh?: number | undefined;
                    timeout?: number | undefined;
                    response_key?: string | undefined;
                    query_params?: Record<string, string> | undefined;
                    refresh_button?: boolean | undefined;
                    control_after_refresh?: "first" | "last" | undefined;
                    max_retries?: number | undefined;
                }>>;
                /** Whether the widget is a multi-select widget. */
                multi_select: z.ZodOptional<z.ZodObject<{
                    placeholder: z.ZodOptional<z.ZodString>;
                    chip: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }, {
                    placeholder?: string | undefined;
                    chip?: boolean | undefined;
                }>>;
            }>, z.ZodTypeAny, "passthrough"> | undefined] | [string, z.objectInputType<{
                default: z.ZodOptional<z.ZodAny>;
                defaultInput: z.ZodOptional<z.ZodBoolean>;
                display_name: z.ZodOptional<z.ZodString>;
                forceInput: z.ZodOptional<z.ZodBoolean>;
                tooltip: z.ZodOptional<z.ZodString>;
                socketless: z.ZodOptional<z.ZodBoolean>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                advanced: z.ZodOptional<z.ZodBoolean>;
                widgetType: z.ZodOptional<z.ZodString>;
                /** Backend-only properties. */
                rawLink: z.ZodOptional<z.ZodBoolean>;
                lazy: z.ZodOptional<z.ZodBoolean>;
            }, z.ZodTypeAny, "passthrough"> | undefined]> | undefined;
        } | undefined;
        output?: (string | (string | number)[])[] | undefined;
        output_is_list?: boolean[] | undefined;
        output_name?: string[] | undefined;
        output_tooltips?: string[] | undefined;
        output_matchtypes?: (string | undefined)[] | undefined;
        help?: string | undefined;
        deprecated?: boolean | undefined;
        experimental?: boolean | undefined;
        api_node?: boolean | undefined;
        input_order?: Record<string, string[]> | undefined;
    }>;

    export declare const zInputSpec: z.ZodUnion<[z.ZodTuple<[z.ZodLiteral<"INT">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        step: z.ZodOptional<z.ZodNumber>;
        /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
        default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
        display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
    }>, {
        /**
         * If true, a linked widget will be added to the node to select the mode
         * of `control_after_generate`.
         */
        control_after_generate: z.ZodOptional<z.ZodBoolean>;
    }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        step: z.ZodOptional<z.ZodNumber>;
        /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
        default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
        display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
    }>, {
        /**
         * If true, a linked widget will be added to the node to select the mode
         * of `control_after_generate`.
         */
        control_after_generate: z.ZodOptional<z.ZodBoolean>;
    }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        step: z.ZodOptional<z.ZodNumber>;
        /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
        default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
        display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
    }>, {
        /**
         * If true, a linked widget will be added to the node to select the mode
         * of `control_after_generate`.
         */
        control_after_generate: z.ZodOptional<z.ZodBoolean>;
    }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"FLOAT">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        step: z.ZodOptional<z.ZodNumber>;
        /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
        default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
        display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
    }>, {
        round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
    }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        step: z.ZodOptional<z.ZodNumber>;
        /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
        default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
        display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
    }>, {
        round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
    }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        step: z.ZodOptional<z.ZodNumber>;
        /** Note: Many node authors are using INT/FLOAT to pass list of INT/FLOAT. */
        default: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodArray<z.ZodNumber, "many">]>>;
        display: z.ZodOptional<z.ZodEnum<["slider", "number", "knob"]>>;
    }>, {
        round: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodLiteral<false>]>>;
    }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"BOOLEAN">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        label_on: z.ZodOptional<z.ZodString>;
        label_off: z.ZodOptional<z.ZodString>;
        default: z.ZodOptional<z.ZodBoolean>;
    }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        label_on: z.ZodOptional<z.ZodString>;
        label_off: z.ZodOptional<z.ZodString>;
        default: z.ZodOptional<z.ZodBoolean>;
    }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        label_on: z.ZodOptional<z.ZodString>;
        label_off: z.ZodOptional<z.ZodString>;
        default: z.ZodOptional<z.ZodBoolean>;
    }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"STRING">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        default: z.ZodOptional<z.ZodString>;
        multiline: z.ZodOptional<z.ZodBoolean>;
        dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
        defaultVal: z.ZodOptional<z.ZodString>;
        placeholder: z.ZodOptional<z.ZodString>;
    }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        default: z.ZodOptional<z.ZodString>;
        multiline: z.ZodOptional<z.ZodBoolean>;
        dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
        defaultVal: z.ZodOptional<z.ZodString>;
        placeholder: z.ZodOptional<z.ZodString>;
    }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        default: z.ZodOptional<z.ZodString>;
        multiline: z.ZodOptional<z.ZodBoolean>;
        dynamicPrompts: z.ZodOptional<z.ZodBoolean>;
        defaultVal: z.ZodOptional<z.ZodString>;
        placeholder: z.ZodOptional<z.ZodString>;
    }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        control_after_generate: z.ZodOptional<z.ZodBoolean>;
        image_upload: z.ZodOptional<z.ZodBoolean>;
        image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
        allow_batch: z.ZodOptional<z.ZodBoolean>;
        video_upload: z.ZodOptional<z.ZodBoolean>;
        audio_upload: z.ZodOptional<z.ZodBoolean>;
        animated_image_upload: z.ZodOptional<z.ZodBoolean>;
        options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        remote: z.ZodOptional<z.ZodObject<{
            route: z.ZodUnion<[z.ZodString, z.ZodString]>;
            refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
            response_key: z.ZodOptional<z.ZodString>;
            query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            refresh_button: z.ZodOptional<z.ZodBoolean>;
            control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
            timeout: z.ZodOptional<z.ZodNumber>;
            max_retries: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }>>;
        /** Whether the widget is a multi-select widget. */
        multi_select: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            chip: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }>>;
    }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        control_after_generate: z.ZodOptional<z.ZodBoolean>;
        image_upload: z.ZodOptional<z.ZodBoolean>;
        image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
        allow_batch: z.ZodOptional<z.ZodBoolean>;
        video_upload: z.ZodOptional<z.ZodBoolean>;
        audio_upload: z.ZodOptional<z.ZodBoolean>;
        animated_image_upload: z.ZodOptional<z.ZodBoolean>;
        options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        remote: z.ZodOptional<z.ZodObject<{
            route: z.ZodUnion<[z.ZodString, z.ZodString]>;
            refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
            response_key: z.ZodOptional<z.ZodString>;
            query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            refresh_button: z.ZodOptional<z.ZodBoolean>;
            control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
            timeout: z.ZodOptional<z.ZodNumber>;
            max_retries: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }>>;
        /** Whether the widget is a multi-select widget. */
        multi_select: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            chip: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }>>;
    }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        control_after_generate: z.ZodOptional<z.ZodBoolean>;
        image_upload: z.ZodOptional<z.ZodBoolean>;
        image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
        allow_batch: z.ZodOptional<z.ZodBoolean>;
        video_upload: z.ZodOptional<z.ZodBoolean>;
        audio_upload: z.ZodOptional<z.ZodBoolean>;
        animated_image_upload: z.ZodOptional<z.ZodBoolean>;
        options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        remote: z.ZodOptional<z.ZodObject<{
            route: z.ZodUnion<[z.ZodString, z.ZodString]>;
            refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
            response_key: z.ZodOptional<z.ZodString>;
            query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            refresh_button: z.ZodOptional<z.ZodBoolean>;
            control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
            timeout: z.ZodOptional<z.ZodNumber>;
            max_retries: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }>>;
        /** Whether the widget is a multi-select widget. */
        multi_select: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            chip: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }>>;
    }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodLiteral<"COMBO">, z.ZodOptional<z.ZodObject<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        control_after_generate: z.ZodOptional<z.ZodBoolean>;
        image_upload: z.ZodOptional<z.ZodBoolean>;
        image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
        allow_batch: z.ZodOptional<z.ZodBoolean>;
        video_upload: z.ZodOptional<z.ZodBoolean>;
        audio_upload: z.ZodOptional<z.ZodBoolean>;
        animated_image_upload: z.ZodOptional<z.ZodBoolean>;
        options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        remote: z.ZodOptional<z.ZodObject<{
            route: z.ZodUnion<[z.ZodString, z.ZodString]>;
            refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
            response_key: z.ZodOptional<z.ZodString>;
            query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            refresh_button: z.ZodOptional<z.ZodBoolean>;
            control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
            timeout: z.ZodOptional<z.ZodNumber>;
            max_retries: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }>>;
        /** Whether the widget is a multi-select widget. */
        multi_select: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            chip: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }>>;
    }>, "passthrough", z.ZodTypeAny, z.objectOutputType<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        control_after_generate: z.ZodOptional<z.ZodBoolean>;
        image_upload: z.ZodOptional<z.ZodBoolean>;
        image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
        allow_batch: z.ZodOptional<z.ZodBoolean>;
        video_upload: z.ZodOptional<z.ZodBoolean>;
        audio_upload: z.ZodOptional<z.ZodBoolean>;
        animated_image_upload: z.ZodOptional<z.ZodBoolean>;
        options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        remote: z.ZodOptional<z.ZodObject<{
            route: z.ZodUnion<[z.ZodString, z.ZodString]>;
            refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
            response_key: z.ZodOptional<z.ZodString>;
            query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            refresh_button: z.ZodOptional<z.ZodBoolean>;
            control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
            timeout: z.ZodOptional<z.ZodNumber>;
            max_retries: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }>>;
        /** Whether the widget is a multi-select widget. */
        multi_select: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            chip: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }>>;
    }>, z.ZodTypeAny, "passthrough">, z.objectInputType<z.objectUtil.extendShape<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, {
        control_after_generate: z.ZodOptional<z.ZodBoolean>;
        image_upload: z.ZodOptional<z.ZodBoolean>;
        image_folder: z.ZodOptional<z.ZodEnum<["input", "output", "temp"]>>;
        allow_batch: z.ZodOptional<z.ZodBoolean>;
        video_upload: z.ZodOptional<z.ZodBoolean>;
        audio_upload: z.ZodOptional<z.ZodBoolean>;
        animated_image_upload: z.ZodOptional<z.ZodBoolean>;
        options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        remote: z.ZodOptional<z.ZodObject<{
            route: z.ZodUnion<[z.ZodString, z.ZodString]>;
            refresh: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodNumber]>>;
            response_key: z.ZodOptional<z.ZodString>;
            query_params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            refresh_button: z.ZodOptional<z.ZodBoolean>;
            control_after_refresh: z.ZodOptional<z.ZodEnum<["first", "last"]>>;
            timeout: z.ZodOptional<z.ZodNumber>;
            max_retries: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }, {
            route: string;
            refresh?: number | undefined;
            timeout?: number | undefined;
            response_key?: string | undefined;
            query_params?: Record<string, string> | undefined;
            refresh_button?: boolean | undefined;
            control_after_refresh?: "first" | "last" | undefined;
            max_retries?: number | undefined;
        }>>;
        /** Whether the widget is a multi-select widget. */
        multi_select: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            chip: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }, {
            placeholder?: string | undefined;
            chip?: boolean | undefined;
        }>>;
    }>, z.ZodTypeAny, "passthrough">>>], null>, z.ZodTuple<[z.ZodEffects<z.ZodString, string, string>, z.ZodOptional<z.ZodObject<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        default: z.ZodOptional<z.ZodAny>;
        defaultInput: z.ZodOptional<z.ZodBoolean>;
        display_name: z.ZodOptional<z.ZodString>;
        forceInput: z.ZodOptional<z.ZodBoolean>;
        tooltip: z.ZodOptional<z.ZodString>;
        socketless: z.ZodOptional<z.ZodBoolean>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        advanced: z.ZodOptional<z.ZodBoolean>;
        widgetType: z.ZodOptional<z.ZodString>;
        /** Backend-only properties. */
        rawLink: z.ZodOptional<z.ZodBoolean>;
        lazy: z.ZodOptional<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">>>], null>]>;

    export declare const zKeybinding: z.ZodObject<{
        commandId: z.ZodString;
        combo: z.ZodObject<{
            key: z.ZodString;
            ctrl: z.ZodOptional<z.ZodBoolean>;
            alt: z.ZodOptional<z.ZodBoolean>;
            shift: z.ZodOptional<z.ZodBoolean>;
            meta: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            key: string;
            shift?: boolean | undefined;
            meta?: boolean | undefined;
            alt?: boolean | undefined;
            ctrl?: boolean | undefined;
        }, {
            key: string;
            shift?: boolean | undefined;
            meta?: boolean | undefined;
            alt?: boolean | undefined;
            ctrl?: boolean | undefined;
        }>;
        targetElementId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        combo: {
            key: string;
            shift?: boolean | undefined;
            meta?: boolean | undefined;
            alt?: boolean | undefined;
            ctrl?: boolean | undefined;
        };
        commandId: string;
        targetElementId?: string | undefined;
    }, {
        combo: {
            key: string;
            shift?: boolean | undefined;
            meta?: boolean | undefined;
            alt?: boolean | undefined;
            ctrl?: boolean | undefined;
        };
        commandId: string;
        targetElementId?: string | undefined;
    }>;

    export declare const zModelFile: z.ZodObject<{
        name: z.ZodString;
        pathIndex: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        pathIndex: number;
    }, {
        name: string;
        pathIndex: number;
    }>;

    export { }
