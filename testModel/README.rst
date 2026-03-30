Test models for imagenet1k
==========================

The web extension PhobiaBlocker uses image classification models trained for imagenet1k.
The model should be accurate and fast. PhobiaBlocker has a risk threshold option from low to very high
which blocks images depending how likely a image is of the blocked classes.
This benchmark tests the model inference time and its accuracy depending on the risk threshold.

Run the benchmark
-----------------

Download the test dataset from
`https://www.kaggle.com/datasets/sautkin/imagenet1kvalid <https://www.kaggle.com/datasets/sautkin/imagenet1kvalid>`__.
It contains 50 000 images, 50 for each of the 1000 classes.
Add all the folders from *00000* to *00999* in *testModel/public/imageNet1kValid*.

Generate imageManifest.json that lists each image path and class.

.. code-block:: console

  $ python testModel/generateImageManifest.py

Modify testModel.ts with the models to test information.

Run the server.

.. code-block:: console

  $ npm run testModel

Finally go to *http://localhost:5174/testModel/* and get the result in the web console.

Results
-------

The benchmark was done on the classes used when the option *spider like* is activated in PhobiaBlocker.
So those results measure how good the models are to detect spider like images from an imagenet1k dataset.

+------------------------+------------+----------+-----------+------------+
| Model                  | Total (ms) | Prep (ms)| Run (ms)  | Decision   |
+========================+============+==========+===========+============+
| squeezenet1.1-7        | 13.2       | 0.6      | 12.1      | 0.5        |
| shufflenet-7           | 109.9      | 0.7      | 108.7     | 0.5        |
| shufflenet-v2-10       | 17.5       | 0.5      | 16.5      | 0.5        |
| efficientnet-lite4-11  | 21.4       | 0.3      | 20.5      | 0.5        |
| mobilenet_v4           | 12.5       | 0.7      | 11.3      | 0.5        |
+------------------------+------------+----------+-----------+------------+

+------------------------+-------------+----------+--------+--------+
| Model                  | Threshold   | Precision| Recall | F1     |
+========================+=============+==========+========+========+
| squeezenet1.1-7        | VERY_LOW    | 0.281    | 0.925  | 0.430  |
| squeezenet1.1-7        | LOW         | 0.525    | 0.877  | 0.657  |
| squeezenet1.1-7        | MEDIUM      | 0.640    | 0.848  | 0.729  |
| squeezenet1.1-7        | HIGH        | 0.768    | 0.787  | 0.778  |
| squeezenet1.1-7        | VERY_HIGH   | 0.827    | 0.743  | 0.783  |
+------------------------+-------------+----------+--------+--------+
| shufflenet-7           | VERY_LOW    | 0.275    | 0.907  | 0.422  |
| shufflenet-7           | LOW         | 0.535    | 0.835  | 0.652  |
| shufflenet-7           | MEDIUM      | 0.642    | 0.790  | 0.709  |
| shufflenet-7           | HIGH        | 0.747    | 0.703  | 0.724  |
| shufflenet-7           | VERY_HIGH   | 0.818    | 0.642  | 0.720  |
+------------------------+-------------+----------+--------+--------+
| shufflenet-v2-10       | VERY_LOW    | 0.400    | 0.965  | 0.565  |
| shufflenet-v2-10       | LOW         | 0.681    | 0.917  | 0.782  |
| shufflenet-v2-10       | MEDIUM      | 0.753    | 0.905  | 0.822  |
| shufflenet-v2-10       | HIGH        | 0.825    | 0.873  | 0.848  |
| shufflenet-v2-10       | VERY_HIGH   | 0.866    | 0.855  | 0.860  |
+------------------------+-------------+----------+--------+--------+
| efficientnet-lite4-11  | VERY_LOW    | 0.802    | 0.963  | 0.875  |
| efficientnet-lite4-11  | LOW         | 0.873    | 0.948  | 0.909  |
| efficientnet-lite4-11  | MEDIUM      | 0.895    | 0.943  | 0.918  |
| efficientnet-lite4-11  | HIGH        | 0.926    | 0.940  | 0.933  |
| efficientnet-lite4-11  | VERY_HIGH   | 0.930    | 0.935  | 0.933  |
+------------------------+-------------+----------+--------+--------+
| mobilenet_v4           | VERY_LOW    | 0.423    | 0.975  | 0.590  |
| mobilenet_v4           | LOW         | 0.751    | 0.953  | 0.840  |
| mobilenet_v4           | MEDIUM      | 0.836    | 0.932  | 0.882  |
| mobilenet_v4           | HIGH        | 0.916    | 0.897  | 0.907  |
| mobilenet_v4           | VERY_HIGH   | 0.942    | 0.855  | 0.896  |
+------------------------+-------------+----------+--------+--------+

The models mobilenet_v4 and efficientnet-lite4 have been selected for the web extension.
