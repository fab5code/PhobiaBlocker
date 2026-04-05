PhobiaBlocker
=============

PhobiaBlocker is a web extension that blocks images related to your phobia.
Choose what to block from a large list of real-world objects (e.g., insects, animals, plants).
It's available in chrome and firefox.

Development
-----------

Create the extension folder *dist* with

.. code-block:: console

  $ npm run build:chrome

Then go to *chrome://extensions/* and *load unpacked* the folder *dist/chrome*.

For firefox:

.. code-block:: console

  $ npm run build:firefox

Then go to *about:debugging* and *Load Temporary Add-on* a file in the folder *dist/firefox*.
