import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from py.util.lora_registry import discover_loras, lora_preview_path

class Folders:
    def __init__(self, model): self.model=model
    def get_filename_list(self, folder): return [self.model.name]
    def get_full_path(self, folder, name): return str(self.model) if name==self.model.name else None
    def get_folder_paths(self, folder): return [str(self.model.parent)]

class LoraPreviewMediaTests(unittest.TestCase):
    def test_local_video_sidecars_are_discovered_without_downloads(self):
        for suffix in ['.mp4','.preview.mp4']:
            with self.subTest(suffix=suffix), TemporaryDirectory() as directory:
                model=Path(directory)/'sample.safetensors';model.write_bytes(b'model')
                preview=model.with_name('sample'+suffix);preview.write_bytes(b'fixture-video')
                folders=Folders(model)
                self.assertEqual(lora_preview_path(model.name,folders),preview.resolve())
                item=discover_loras(folders)['items'][0]
                self.assertIsNotNone(item['preview_url'])
                self.assertEqual(item['preview_media_type'],'video')
                self.assertFalse(item['preview_safe'])
    def test_existing_image_priority_wins_over_video(self):
        with TemporaryDirectory() as directory:
            model=Path(directory)/'sample.safetensors';model.write_bytes(b'model')
            model.with_name('sample.preview.mp4').write_bytes(b'fixture-video')
            image=model.with_name('sample.jpeg');image.write_bytes(b'fixture-image')
            folders=Folders(model)
            self.assertEqual(lora_preview_path(model.name,folders),image.resolve())
            self.assertEqual(discover_loras(folders)['items'][0]['preview_media_type'],'image')

if __name__=='__main__': unittest.main()
