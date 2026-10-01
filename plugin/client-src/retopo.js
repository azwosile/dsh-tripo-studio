// 0.3.5 REQ-076/077: pure retopology/orientation helpers and the official notes (unit-tested; UI in retopo-panel.jsx).
export const DECIMATE_DOC = 'https://developers.tripo3d.com/zh/docs/mesh-decimate'
export const CONVERT_DOC = 'https://developers.tripo3d.com/zh/docs/models-convert'
export const RETOPO_OFFICIAL_TIPS = Object.freeze([
 '官方定位：v2.0（默认）为智能低模重拓扑，重建干净拓扑并尽量保边保细节；v1.0 为基础减面。',
 'v2.0 · 30 积分：face_limit 可选，三角面 500–20,000、四边面 500–10,000，不填则自适应；支持 quad、bake（默认 true）和 part_names；输出 GLB。',
 'v1.0 · 10 积分：face_limit 必填，三角面最高 2,000,000、四边面最高 150,000；不支持 bake 与 part_names。',
 '输入：此前 3D 生成任务的 task_id（文/图/多视图生3D）；官方支持 GLB / GLTF / FBX / OBJ / STL，最大 150 MB。',
 '官方提示：复杂模型可能处理失败（智能低模最适合较简单的输入）；实际扣费以云端结算为准。',
 '这是一笔新的独立收费任务，不会在生成后自动触发；原模型不会被修改，结果另存为新的模型资产。',
])
export const ORIENTATION_GEN_TIP = '官方说明：export_orientation 为导出前向轴，默认 +x，仅作用于本次生成。若之后还要做贴图、绑定、重定向、格式转换等后处理，官方不建议设置——方向错误会影响后处理效果，但任务仍显示 success、不会报错；官方建议留空，最后一步再用 /v3/models/convert 转换朝向。此处只在你明确选择后才发送。'
/** Official caveat when a post-process (convert / retopology) starts from a generation that set export_orientation. */
export const orientationCaveat = job => job?.params?.export_orientation ? `所选原模型在生成时设置了 export_orientation=${job.params.export_orientation}。官方提示：用于后处理可能因方向错误影响效果，任务仍会显示 success、不会报错。` : ''
export const ORIENTATION_CONVERT_TIP = '官方 /models/convert 的 export_orientation：前向轴 +x（默认）/ -x / -y / +y；不选择则沿用官方默认 +x。'
export function retopoSpec({job, model, faceMode, faceLimit, quad, bake}) {
 const params = {input_job: job.id, model, quad}
 if (model === 'v1.0' || faceMode === 'fixed') params.face_limit = faceLimit
 if (model === 'v2.0' && bake === false) params.bake = false
 const faces = params.face_limit ? `${params.face_limit}面` : '自适应'
 return {kind: 'mesh-decimate', label: `${job.label} → 重拓扑 ${model} · ${faces}${quad ? ' · 四边面' : ''}`.slice(0, 100), params}
}

