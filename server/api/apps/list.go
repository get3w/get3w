package apps

import (
	"net/http"

	"github.com/get3w/get3w/home"
	"github.com/get3w/get3w/server/api"
	"github.com/labstack/echo"
)

// List return apps
func List() echo.HandlerFunc {
	return func(c echo.Context) error {
		if api.IsAnonymous(c) {
			return api.ErrorUnauthorized(c, nil)
		}

		config, err := home.LoadConfig()
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		return c.JSON(http.StatusOK, config.Apps)
	}
}
