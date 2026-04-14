PhobiaBlocker
=============

PhobiaBlocker is a web extension that blocks images related to your phobia.
Choose what to block from a large list of real-world objects (e.g., insects, animals, plants).
It's available in chrome and firefox.

Features
--------

* Automatically block images representing real-world objects you have chosen
* Manually block or unblock images using the right-click menu
* Block all images across all websites
* Automatically block or trust (to improve performance) images whose src matches a specified regex (blocking takes priority)
* Add trusted websites (domain name with subdomain) to improve performance

Options
-------

* Quick option to block spider-like and insect-like images
* Advanced selection from a long list of real-world objects
* Speed/Accuracy tradeoff of the automatic blocker
* Risk management of the automatic blocker
* Add or remove regex rules to automatically trust or block images using their src
* Pause the automatic blocker (manual blocking remains enabled)
* Enable dark or light mode (dark mode is enabled by default)
* Label trusted websites from the popup menu

Privacy
-------
No browsing data is sent to an external endpoint.
Images are analysed locally on the computer but they are not saved, except in a transformed form within a local cache that can be disabled in the options.
No code is executed externally. Machine learning models are executed locally.

Technical details and restrictions
----------------------------------

* Machine learning models for ImageNet classification are used to analyse images. The list of things to block comes from ImageNet classes. This is why only real-world objects are supported. For instance blocking abstract phobias like heights or gore is not supported.
* The extension analyses <img> and SVG <image> elements. When a new image is added to the DOM or changes, the element is analysed as well. Images from <canvas> elements and the CSS background-image property are not supported.
* Images are temporarily blocked before they are analysed. Images can blink before being temporarily blocked in rare cases.
* Most of the extension's size is due to the machine learning models and the library to execute them.
* The automatic blocker uses a cache of decisions, which can be stored locally or used only temporarily. The cache contains non-cryptographic hashes of images. Both the cache and its persistence mechanism can be disabled in the options.

Development
-----------

Install dependencies

.. code-block:: console

  $ npm install

Create the extension folder *dist* with

.. code-block:: console

  $ npm run build:chrome

Then go to *chrome://extensions/* and *load unpacked* the folder *dist/chrome*.

For firefox:

.. code-block:: console

  $ npm run build:firefox

Then go to *about:debugging* and *Load Temporary Add-on* a file in the folder *dist/firefox*.

The ML models will be automatically downloaded from `huggingface <https://huggingface.co>`__.
