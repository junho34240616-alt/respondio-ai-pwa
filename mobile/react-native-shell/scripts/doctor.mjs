const requiredMajor = 20;
const requiredMinor = 19;
const requiredPatch = 4;

function parseVersion(version) {
  const cleaned = String(version || '').replace(/^v/, '');
  const [major, minor, patch] = cleaned.split('.').map((value) => Number(value || 0));
  return { major, minor, patch, raw: cleaned };
}

function isAtLeast(current, target) {
  if (current.major !== target.major) {
    return current.major > target.major;
  }
  if (current.minor !== target.minor) {
    return current.minor > target.minor;
  }
  return current.patch >= target.patch;
}

const current = parseVersion(process.version);
const target = {
  major: requiredMajor,
  minor: requiredMinor,
  patch: requiredPatch
};

if (current.major !== target.major || !isAtLeast(current, target)) {
  console.error(
    [
      `현재 Node 버전: ${current.raw}`,
      `권장 Node 버전: ${requiredMajor}.${requiredMinor}.${requiredPatch} (Expo SDK 54 / LTS 기준)`,
      '이 프로젝트는 Node 24에서 Expo start 중 포트 탐색 오류를 재현했습니다.',
      '가능하면 nvm으로 20.19.4를 사용해 주세요.'
    ].join('\n')
  );
  process.exitCode = 1;
} else {
  console.log(`Node 버전 확인 완료: ${current.raw}`);
}
