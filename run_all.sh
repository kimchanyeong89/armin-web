#!/bin/bash
node fix_exhibitions_2.cjs
node table_script_v4.cjs > final_table_output.md
grep '| 0 |' final_table_output.md || echo "SUCCESS_NO_ZEROS"
