package status

import (
	"net/http"

	"github.com/get3w/get3w"
	"github.com/labstack/echo"
)

// Get status
func Get() echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"environment": get3w.Environment(),
		})
	}
}
