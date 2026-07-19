from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    confirm_password: str = Field(min_length=6, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("两次密码不一致")
        return self


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=16)


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    status: str
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


class DatasetRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    allowDuplicate: bool = False


class DatasetBulkRequest(BaseModel):
    datasetIds: list[int] = Field(min_length=1, max_length=100)


class LabelDistributionItem(BaseModel):
    label: str
    count: int
    percent: int


class ClusterStatItem(BaseModel):
    name: str
    clusterCount: int
    range: str


class DatasetCatalogItemResponse(BaseModel):
    id: int
    name: str
    createdAt: str
    fileSizeBytes: int
    sampleCount: int
    baseCount: int
    classCount: int
    hasLabels: bool
    dataType: str = "数值"
    taskCount: int = 0
    lastAnalysisAt: str | None = None
    version: int = 1
    qualityStatus: str = "ready"
    qualityIssues: list[str] = Field(default_factory=list)
    matrixShape: str
    labelShape: str
    labelDistribution: list[LabelDistributionItem] = Field(default_factory=list)
    clusterStats: list[ClusterStatItem] = Field(default_factory=list)


class DatasetCatalogPageResponse(BaseModel):
    items: list[DatasetCatalogItemResponse] = Field(default_factory=list)
    total: int
    page: int
    pageSize: int
    totalPages: int


class DatasetRevisionResponse(BaseModel):
    id: int
    version: int
    action: str
    name: str
    originalFilename: str
    createdAt: str
    sampleCount: int
    baseCount: int
    classCount: int
    hasLabels: bool
    qualityStatus: str
    qualityIssues: list[str] = Field(default_factory=list)


class DatasetTaskCreateRequest(BaseModel):
    datasetId: int
    name: str | None = Field(default=None, max_length=128)
    selectedBaseCount: int = Field(default=0, ge=0)


class DatasetTaskBulkCreateRequest(BaseModel):
    datasetIds: list[int] = Field(min_length=1, max_length=100)


class DatasetTaskResponse(BaseModel):
    id: int
    datasetId: int
    datasetName: str
    name: str
    status: str
    selectedBaseCount: int
    createdAt: str
    updatedAt: str


class DatasetTaskPageResponse(BaseModel):
    items: list[DatasetTaskResponse] = Field(default_factory=list)
    total: int


class AnalysisTaskParams(BaseModel):
    nBase: int = Field(default=20, ge=1, le=500)
    sigma: float = Field(default=1.0, ge=0)
    lambdaValue: float = Field(default=5.0, ge=0, alias="lambda")
    gamma: float = Field(default=5.0, ge=0)
    anchor: int = Field(default=10, ge=1, le=1000)
    runs: int = Field(default=10, ge=1, le=100)
    maxIter: int = Field(default=10, ge=1, le=200)
    randomSeed: int = Field(default=1, ge=0, le=2147483647)

    model_config = {"populate_by_name": True}


class AnalysisTaskCreateRequest(BaseModel):
    datasetId: int
    name: str | None = Field(default=None, max_length=128)
    mode: str = Field(default="OMELET-SV")
    params: AnalysisTaskParams | None = None
    startImmediately: bool = False
    templateId: int | None = None


class AnalysisTaskUpdateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    mode: str | None = None
    params: AnalysisTaskParams | None = None


class AnalysisTaskBulkRequest(BaseModel):
    taskIds: list[int] = Field(min_length=1, max_length=100)
    action: str


class AnalysisTaskMetricsSummary(BaseModel):
    acc: float | None = None
    nmi: float | None = None
    ari: float | None = None
    f1: float | None = None


class AnalysisTaskResponse(BaseModel):
    id: int
    name: str
    mode: str
    status: str
    progress: float
    currentRun: int = 0
    totalRuns: int = 1
    queuePosition: int | None = None
    currentIter: int
    maxIter: int
    currentStage: str | None = None
    datasetId: int
    datasetName: str
    params: dict
    errorMessage: str | None = None
    failureReason: str | None = None
    metricsSummary: AnalysisTaskMetricsSummary | None = None
    runtimeSeconds: float | None = None
    createdAt: str
    startedAt: str | None = None
    finishedAt: str | None = None
    updatedAt: str


class AnalysisTaskPageResponse(BaseModel):
    items: list[AnalysisTaskResponse] = Field(default_factory=list)
    total: int
    page: int
    pageSize: int
    totalPages: int


class AnalysisTaskStatsResponse(BaseModel):
    total: int = 0
    draft: int = 0
    queued: int = 0
    running: int = 0
    succeeded: int = 0
    failed: int = 0
    cancelled: int = 0
    todayCompleted: int = 0
    averageRuntimeSeconds: float | None = None
    failureRate: float = 0.0


class AnalysisTaskLogItem(BaseModel):
    id: int
    action: str
    level: str
    message: str
    createdAt: str
    detail: dict | None = None


class AnalysisTaskLogPageResponse(BaseModel):
    items: list[AnalysisTaskLogItem] = Field(default_factory=list)
    total: int


class TaskResultEnvelope(BaseModel):
    state: str
    task: AnalysisTaskResponse | None = None
    result: dict | None = None


class TaskExportCreateRequest(BaseModel):
    items: list[str] = Field(min_length=1, max_length=12)
    name: str | None = Field(default=None, max_length=128)


class TaskExportResponse(BaseModel):
    id: int
    name: str
    items: list[str] = Field(default_factory=list)
    itemCount: int
    status: str
    filename: str
    fileSize: int
    createdAt: str
    downloadUrl: str


class TaskExportListResponse(BaseModel):
    items: list[TaskExportResponse] = Field(default_factory=list)


class TaskTemplateCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    mode: str = Field(default="OMELET-SV")
    params: AnalysisTaskParams | None = None


class TaskTemplateResponse(BaseModel):
    id: int
    name: str
    mode: str
    params: dict
    createdAt: str


class TaskTemplateListResponse(BaseModel):
    items: list[TaskTemplateResponse] = Field(default_factory=list)
