import pandas as pd
import os
import shutil

# 输入文件夹路径（放原始CSV文件）
input_folder = 'table_update'

# 输出文件夹路径（用于保存清洗后的结果）
output_folder = 'E:/arcgis_workspace/data/UE_cleaned_outputs_update'

# 处理完成后要移动到的文件夹路径
processed_folder = 'E:/Desktop/5Gsimulation_XGboost/pythonProject/table'

# 如果输出和移动目标文件夹不存在则创建
os.makedirs(output_folder, exist_ok=True)
os.makedirs(processed_folder, exist_ok=True)

# 遍历文件夹中的所有CSV文件
for file_name in os.listdir(input_folder):
    if file_name.endswith('.csv'):
        file_path = os.path.join(input_folder, file_name)
        print(f"正在处理文件：{file_name}")

        try:
            # 读取CSV文件
            df = pd.read_csv(file_path, header=0, low_memory=False)

            if df.empty:
                print(f"文件 {file_name} 为空，跳过。")
                continue

            # 获取第二行数据
            first_data_row = df.iloc[0]

            # 找出空列（NaN 或 空字符串）
            empty_cols = first_data_row[first_data_row.isna() | (first_data_row == '')].index

            # 删除空列
            df_cleaned = df.drop(columns=empty_cols)

            # 删除经纬度重复的行
            latitude_col = 'LATITUDE'
            longitude_col = 'LONGITUDE'
            df_cleaned = df_cleaned.drop_duplicates(subset=[latitude_col, longitude_col])

            # 合并 GNODEB 和 GCELLID 成 CGI
            df_cleaned['CGI'] = df_cleaned['GNODEB'].astype(str) + df_cleaned['GCELLID'].astype(str)

            # 构建输出文件名
            output_file_path = os.path.join(output_folder, f"cleaned_{file_name}")

            # 保存处理后的数据
            df_cleaned.to_csv(output_file_path, index=False, encoding='utf-8-sig')
            print(f"已保存清洗结果到：{output_file_path}")

            # 移动处理完成的原始文件
            shutil.move(file_path, os.path.join(processed_folder, file_name))
            print(f"已移动原始文件到：{processed_folder}")

        except Exception as e:
            print(f"处理文件 {file_name} 时出错：{e}")
