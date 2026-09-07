from math import gcd, sqrt


class BVImageDimensions:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",)}}

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("ratio", "custom_resolution")
    FUNCTION = "read_dimensions"
    CATEGORY = "🌀 BV Node Pack/image"
    DESCRIPTION = (
        "Reads the exact reduced W:H ratio and round(sqrt(width * height)) "
        "as an integer square-area resolution. Connect to BV Empty Latent Random "
        "Ratio with resolution set to Custom and all standard ratios disabled. "
        "Alignment remains controlled by the latent node."
    )

    def read_dimensions(self, image):
        shape = getattr(image, "shape", ())
        if len(shape) != 4:
            raise ValueError("Expected an IMAGE batch with shape [batch, height, width, channels].")
        height, width = int(shape[1]), int(shape[2])
        if height <= 0 or width <= 0:
            raise ValueError("Image width and height must be positive.")
        divisor = gcd(width, height)
        return f"{width // divisor}:{height // divisor}", round(sqrt(width * height))


NODE_CLASS_MAPPINGS = {"BV Image Dimensions": BVImageDimensions}
NODE_DISPLAY_NAME_MAPPINGS = {"BV Image Dimensions": "🌀 BV Image Dimensions"}
