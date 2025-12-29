import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder
from scipy.stats import mode
from scipy.ndimage import uniform_filter

# === 参数设定 ===
csv_path = r"E:\Desktop\5Gsimulation_XGboost\pythonProject\table\fishnet_30x30_export.csv"
output_path = r"E:\Desktop\5Gsimulation_XGboost\pythonProject\table\fishnet_30x30_processed.csv"
rows, cols = 100, 100

target_fields = [
    "SPEED_M_s_", "ALT_M_", "NETWORK_TYPE", "NR_TAC", "NR_BAND", "NR_PCI",
    "SS_RSRP", "SS_RSRQ", "SS_SINR",
    "Base_CGI", "Base_LONGITUDE", "Base_LATITUDE", "Base_Direction_angle",
    "Base_Central_frequency_point", "Base_Bandwidth", "Base_Electronic_downtilt",
    "Base_Mechanical_downtilt", "Base_Power", "Match_Dist", "Match_Angle", "True_3D_Dist"
]

categorical_fields = ["NETWORK_TYPE", "NR_BAND", "Base_Bandwidth"]

# === 读取数据 ===
df = pd.read_csv(csv_path)

# === 自定义编码函数（保留缺失为np.nan）===
def label_encode_with_nan(series):
    le = LabelEncoder()
    is_nan = series.isna()
    filled = series.fillna("MISSING")
    encoded = le.fit_transform(filled.astype(str))
    missing_label = le.transform(["MISSING"])[0]
    encoded = np.where(encoded == missing_label, np.nan, encoded)
    return encoded, le

# === 编码分类字段 ===
label_encoders = {}
for field in target_fields:
    if df[field].dtype == 'object' or field in categorical_fields:
        encoded, le = label_encode_with_nan(df[field])
        df[field] = encoded
        label_encoders[field] = le

# === OID 映射到行列索引 ===
def oid_to_rc(oid):
    oid -= 1
    row = rows - 1 - oid // cols
    col = oid % cols
    return row, col

# === 创建二维矩阵 ===
def create_value_matrix(field):
    mat = np.full((rows, cols), np.nan)
    for _, row in df.iterrows():
        r, c = oid_to_rc(int(row["OID"]))
        mat[r, c] = row[field]
    return mat

# === 均值填充 ===
def fill_once_mean(array):
    new_array = array.copy()
    filled = 0
    for i in range(rows):
        for j in range(cols):
            if np.isnan(array[i, j]):
                neighbors = array[max(0, i-1):min(rows, i+2), max(0, j-1):min(cols, j+2)]
                values = neighbors[~np.isnan(neighbors)]
                if len(values) > 0:
                    new_array[i, j] = values.mean()
                    filled += 1
    return new_array, filled

# === 众数填充 ===
def fill_once_mode(array):
    new_array = array.copy()
    filled = 0
    for i in range(rows):
        for j in range(cols):
            if np.isnan(array[i, j]):
                neighbors = array[max(0, i-1):min(rows, i+2), max(0, j-1):min(cols, j+2)]
                values = neighbors[~np.isnan(neighbors)].astype(int)
                if len(values) > 0:
                    new_array[i, j] = mode(values, keepdims=False).mode
                    filled += 1
    return new_array, filled

# === 多轮填充 ===
def iterative_fill(mat, method="mean", max_iter=20):
    for i in range(max_iter):
        mat, count = (fill_once_mean(mat) if method == "mean" else fill_once_mode(mat))
        print(f"第{i+1}轮填充：{count} 个值")
        if count == 0:
            break
    return mat

# === 执行所有字段填充 ===
for field in target_fields:
    print(f"\n处理字段：{field}")
    mat = create_value_matrix(field)
    method = "mode" if field in categorical_fields else "mean"
    filled_mat = iterative_fill(mat, method=method)
    # 结果回写
    updated = []
    for oid in df["OID"]:
        r, c = oid_to_rc(int(oid))
        updated.append(filled_mat[r, c])
    df[field] = updated

# === 反编码类别字段 ===
for field, le in label_encoders.items():
    arr = df[field].to_numpy()
    nan_mask = np.isnan(arr)
    arr[nan_mask] = 0
    decoded = le.inverse_transform(arr.astype(int))
    decoded[nan_mask] = 'MISSING'
    df[field] = decoded

# === 加权建筑覆盖率特征（5x5均值）===
building_mat = create_value_matrix("Building_Coverage")
coverage_5x5 = uniform_filter(building_mat, size=5, mode='constant')
# 结果写入 df
coverage_vals = []
for oid in df["OID"]:
    r, c = oid_to_rc(int(oid))
    coverage_vals.append(coverage_5x5[r, c])
df["Building_Coverage_5x5"] = coverage_vals

# === 保存结果 ===
df.to_csv(output_path, index=False, encoding='utf-8-sig')
print(f"\n✅ 所有字段填充完毕，建筑覆盖率特征已生成，已保存至：{output_path}")
