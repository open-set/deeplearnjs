/**
 * @license
 * Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import {ConvInfo} from '../conv_util';
import {GPGPUProgram} from './gpgpu_math';

export class Conv2DProgram implements GPGPUProgram {
  variableNames = ['x', 'W'];
  params: Array<{}>;
  outputShape: number[];
  userCode: string;

  constructor(convInfo: ConvInfo, hasBias: boolean) {
    if (hasBias) {
      this.variableNames.push('bias');
    }

    this.outputShape = convInfo.outShape;
    const biasSnippet = hasBias ? 'dotProd += getBias(d2);' : '';
    const [xNumRows, xNumCols, inputDepth] = convInfo.inShape;
    const padTop = convInfo.padInfo.top;
    const padLeft = convInfo.padInfo.left;
    const strideHeight = convInfo.strideHeight;
    const strideWidth = convInfo.strideWidth;
    const filterHeight = convInfo.filterHeight;
    const filterWidth = convInfo.filterWidth;

    this.params = [strideHeight, strideWidth, hasBias, padLeft, padTop];

    this.userCode = `
      const ivec2 strides = ivec2(${strideHeight}, ${strideWidth});
      const ivec2 pads = ivec2(${padTop}, ${padLeft});

      void main() {
        ivec3 coords = getOutputCoords();
        int d2 = coords.x;

        ivec2 xRCCorner = coords.yz * strides - pads;
        int xRCorner = xRCCorner.x;
        int xCCorner = xRCCorner.y;

        // Convolve x(d1, ?, ?) with w(d2, d1, :, :) to get y(d2, yR, yC).
        // ? = to be determined. : = across all values in that axis.
        float dotProd = 0.0;

        for (int d1 = 0; d1 < ${inputDepth}; d1++) {

          for (int wR = 0; wR < ${filterHeight}; wR++) {
            int xR = xRCorner + wR;

            if (xR < 0 || xR >= ${xNumRows}) {
              continue;
            }

            for (int wC = 0; wC < ${filterWidth}; wC++) {
              int xC = xCCorner + wC;

              if (xC < 0 || xC >= ${xNumCols}) {
                continue;
              }

              float xValue = getX(d1, xR, xC);
              float wValue = getW(d2, d1, wR, wC);
              dotProd += xValue * wValue;
            }
          }
        }
        ${biasSnippet}
        setOutput(dotProd);
      }
    `;
  }
}
