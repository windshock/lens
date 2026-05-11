import ray
from vllm import LLModel

ray.init(address='auto')  # 자동으로 Ray 클러스터에 연결

@ray.remote
class MistralWorker:
    def __init__(self, model_path):
        self.model = LLModel(model_path, device='cpu')

    def infer(self, inputs):
        return self.model(inputs)

# Worker 인스턴스 생성
workers = [MistralWorker.remote('path_to_mistral_model') for _ in range(8)]

# 예시 입력 데이터
inputs = ["hello", "안녕"]

# 분산 처리 요청
futures = [worker.infer.remote(input) for worker, input in zip(workers, inputs)]
results = ray.get(futures)

print(results)
