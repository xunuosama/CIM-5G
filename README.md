# CIM-5G

## Project Overview 

This storage repository is designed to store the modules and datasets related to 5G signal path loss and prediction within the CIM system.

Our dataset is stored in the `data` folder. Among them, `Raw_data` represents the completely unprocessed original data, `Base_station` data is a subset of base station information, and `Grid-Based_Feature-Engineered_data` represents the data that has been integrated into spatial grids and ultimately used for XGBoost model training. The repository supports the full workflow from raw data acquisition to feature engineering, model training, and explainable analysis for 5G signal propagation studies in complex urban environments.

---

## File Description

All datasets are stored in the `data` directory, while model training and hyperparameter optimization scripts are located in the `train` directory.

### Raw Data (`raw_data.csv`)
This file contains complete, unprocessed signal measurements collected via UAV-based aerial surveys and manual ground surveys. Each row corresponds to a single sampling record, and each column represents a measured attribute, such as signal strength or spatial coordinates. The dataset captures high-resolution, real-world 5G signal variations and serves as the foundation for subsequent processing and analysis. Table 1 lists all parameters of the raw data. The raw dataset contains a total of **81,419** entries.

### Grid-Based Feature-Engineered Data (`macro-cell_30x30.csv` / `macro-cell_30x30.shp`)
Within the 3 km × 3 km study area, a regular vector grid with a spatial resolution of 30 m × 30 m was constructed, resulting in **10,000** grid cells. Terminal measurements, base station information, and other multimodal environmental data were spatially integrated into each grid cell, followed by systematic feature engineering. All derived features were assigned as grid attributes, enabling direct export as structured input for XGBoost training. Table 2 summarizes all parameters of the grid-based dataset, which contains **10,000** entries.

### Operator Base Station Data (`base_stations.csv`)
This dataset includes base station information provided by the network operator, such as unique identifiers, geographic coordinates, and key site parameters. These records are used to associate measured signals with corresponding macro-cell infrastructure. Table 3 lists all parameters of the base station dataset, which contains **191** entries.

All files are georeferenced using the **UTM 48N** coordinate system and are accompanied by detailed README and metadata files compliant with the *Scientific Data DataCite* schema, ensuring transparency, reproducibility, and ease of reuse.

---

## Presentation Method of the Final Result 

The final outputs of this project include trained XGBoost regression models saved in `.pkl` format, quantitative evaluation metrics such as RMSE and R², and visualization-based interpretability results. Model explainability is achieved through SHAP analysis to quantify feature contributions, as well as Partial Dependence Plots (PDPs) to illustrate the functional relationships between key features and predicted signal strength (RSRP).

---

## Operating Guide 

All training and hyperparameter optimization scripts are located in the `train` directory. To run the model, users can directly enable the commented training section in the provided scripts. Once executed, the pipeline will automatically train the XGBoost model and save the resulting `.pkl` model file. The trained model can then be directly used for SHAP-based feature importance analysis and PDP-based sensitivity analysis without additional configuration.

---

## Important Notes 

Users should ensure that all file paths are correctly configured according to the local directory structure before execution. Consistent coordinate systems must be maintained when integrating spatial datasets. Additionally, signal quality indicators such as RSRP, RSRQ, and SINR should not be simultaneously used as both input features and prediction targets to avoid data leakage.

---

## Conclusion

This repository provides a complete and reproducible framework for 5G path loss modeling and signal strength prediction, integrating high-fidelity measurements, GIS-based feature engineering, and explainable machine learning. It supports in-depth analysis of signal propagation mechanisms in complex environments and offers practical value for network planning, optimization, and future research on data-driven wireless propagation modeling.
```

