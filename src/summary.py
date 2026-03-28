import pandas as pd

from translate import lang_dir_walk, lang_dirs

dct_totals = {}
dct_reviewed = {}

def summarize(file_path, target_lang):
    df = pd.read_csv(file_path)
    dct_totals[target_lang] += len(df['reviewed'])
    dct_reviewed[target_lang] += df['reviewed'].sum()


def proc(root, target_lang):
    dct_totals[target_lang] = 0
    dct_reviewed[target_lang] = 0
    lang_dir_walk(root + target_lang, 'new-lang', lambda x: summarize(x, target_lang))
    pct = dct_reviewed[target_lang]/dct_totals[target_lang] * 100
    print(f"{target_lang:7}: {pct:3.2f}%")

if __name__ == "__main__":
    [proc('../', x) for x in lang_dirs('../')]