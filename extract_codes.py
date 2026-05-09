import pandas as pd
import sys

file_path = '20260413_kakutei_chitan.xlsx'
print(f"Loading Excel file: {file_path}")

try:
    # `header=None` で全データ行として読み込み、`dtype=str` で文字列として扱う
    xls = pd.read_excel(file_path, sheet_name=None, header=None, dtype=str)
except Exception as e:
    print(f"Error loading Excel: {e}")
    sys.exit(1)

unique_codes = set()

# A=0, B=1, C=2, D=3, E=4, ..., AI=34, ..., BC=54 (0-index)
INDEX_D = 3
INDEX_E = 4
INDEX_AI = 34
INDEX_BC = 54

def clean_val(v):
    if pd.isna(v):
        return ""
    v = str(v).strip()
    if v.endswith('.0'):
        v = v[:-2]
    return v

for sheet_name, df in xls.items():
    print(f"Processing sheet [{sheet_name}]...")
    for index, row in df.iterrows():
        try:
            # 列が存在するかチェック（短い行対策）
            if len(row) <= INDEX_BC:
                continue

            val_d = clean_val(row[INDEX_D])
            val_e = clean_val(row[INDEX_E])
            val_ai = clean_val(row[INDEX_AI])
            val_bc = clean_val(row[INDEX_BC])

            # E列が「001」またはExcelにより数値化されて「1」になっている場合を考慮
            # ※文字列指定で読んでいるので「001」なら「001」になるはず
            if val_e == "001":
                if val_ai == "0" and val_bc == "0":
                    if len(val_d) >= 5:
                        # D列の上5桁を取得
                        code_5digit = val_d[:5]
                        unique_codes.add(code_5digit)
        except Exception as e:
            print(f"Row error on sheet {sheet_name}, row {index}: {e}")

# target_codes.txt への書き出し
output_file = 'target_codes.txt'
print(f"Extracted {len(unique_codes)} unique 5-digit codes. Writing to {output_file}...")

with open(output_file, 'w', encoding='utf-8') as f:
    for code in sorted(list(unique_codes)):
        f.write(code + '\n')

print("Process completed.")
