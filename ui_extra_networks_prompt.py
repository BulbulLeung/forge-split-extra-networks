from modules import ui_extra_networks


class ExtraNetworksPagePrompt(ui_extra_networks.ExtraNetworksPage):
    def __init__(self):
        super().__init__("Prompt")
        self.allow_prompt = False
        # Avoid collision with generation prompt elem_id (#txt2img_prompt).
        self.extra_networks_tabname = "en_prompt"

    def refresh(self):
        self.lister.reset()

    def list_items(self):
        yield from ()

    def create_dirs_view_html(self, tabname: str) -> str:
        return ""

    def create_card_view_html(self, tabname: str, *, none_message) -> str:
        return (
            f'<div class="forge-en-prompt-tags extra-network-dirs" '
            f'id="{tabname}_en_prompt_tags" data-tabname="{tabname}"></div>'
        )
