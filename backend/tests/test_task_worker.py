import numpy as np

from app.task_worker import _matrix_preview


def test_matrix_preview_keeps_twenty_highest_off_diagonal_pairs():
    matrix = np.eye(8, dtype=float)
    value = 0.01
    for row in range(matrix.shape[0]):
        for column in range(row + 1, matrix.shape[1]):
            matrix[row, column] = value
            matrix[column, row] = value
            value += 0.01

    top_pairs = _matrix_preview(matrix)["topPairs"]
    ranked_values = [pair["value"] for pair in top_pairs]

    assert len(top_pairs) == 20
    assert ranked_values == sorted(ranked_values, reverse=True)
    assert all(pair["row"] < pair["column"] for pair in top_pairs)
    assert len({(pair["row"], pair["column"]) for pair in top_pairs}) == 20


def test_matrix_preview_uses_the_actual_pair_count_for_small_matrices():
    preview = _matrix_preview(np.array([[1.0, 0.25], [0.25, 1.0]]))

    assert preview["topPairs"] == [{"row": 1, "column": 2, "value": 0.25}]
