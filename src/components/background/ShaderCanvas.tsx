import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

/** The animated WebGL gradient (loaded lazily by <ShaderBackground />). */
export default function ShaderCanvas({ still, pixelDensity }: { still: boolean; pixelDensity: number }) {
  return (
    <ShaderGradientCanvas style={{ position: "absolute", inset: 0 }} pixelDensity={pixelDensity} fov={45} pointerEvents="none" lazyLoad={false}>
      <ShaderGradient
        animate={still ? "off" : "on"}
        brightness={1.2}
        cAzimuthAngle={180}
        cDistance={3.6}
        cPolarAngle={90}
        cameraZoom={1}
        color1="#0022ff"
        color2="#00c1db"
        color3="#1e00e1"
        envPreset="city"
        grain="on"
        lightType="3d"
        positionX={-1.4}
        positionY={0}
        positionZ={0}
        range="disabled"
        rangeEnd={40}
        rangeStart={0}
        reflection={0.1}
        rotationX={0}
        rotationY={10}
        rotationZ={50}
        shader="defaults"
        type="plane"
        uAmplitude={1}
        uDensity={1.7}
        uFrequency={5.5}
        uSpeed={0.1}
        uStrength={2.9}
        uTime={0}
        wireframe={false}
      />
    </ShaderGradientCanvas>
  );
}
